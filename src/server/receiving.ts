"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth";
import { isShopifyConfigured } from "@/lib/shopify-config";
import {
  lookupVariantByBarcode,
  lookupVariantBySku,
  fetchAppAccessScopes,
  fetchShopifyLocations,
  fetchVariantsForPush,
  setOnHandQuantities,
  type VariantHit,
} from "@/lib/shopify";
import { mapCsvRows, buildReceivingWrites, type ExtractedLine, type ReceivingItem } from "@/lib/receiving";
import { extractLinesFromDocument } from "@/lib/receiving-extract";
import { type ActionResult, firstError, dbError } from "@/server/shared";

const BUCKET = "receiving-docs";
const MAX_DOC_BYTES = 15 * 1024 * 1024;
const ONE_OPEN = {
  "23505": "This store already has an open New Stock session — finish or delete it first.",
};
const UNREACHABLE = "Shopify is unreachable — try again in a minute.";

/** Load a restock count the current admin may access; enforces open + kind. */
async function loadOpenRestock(countId: string) {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("inventory_counts")
    .select("id, location_id, status, kind, document_path")
    .eq("id", countId)
    .maybeSingle();
  return { supabase, count: data };
}

// ---------------------------------------------------------------------------
// 1. Start a New Stock session
// ---------------------------------------------------------------------------
const startSchema = z.object({
  locationId: z.string().uuid(),
  note: z.string().trim().max(300).optional(),
});

export async function startReceiving(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("inventory_counts")
    .insert({
      location_id: parsed.data.locationId,
      kind: "restock",
      note: parsed.data.note || null,
      started_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbError(error, ONE_OPEN) };
  revalidatePath("/admin/inventory");
  return { ok: true, data: { id: data.id } };
}

// ---------------------------------------------------------------------------
// 2. Upload the arrival document (stored private; extracted on demand)
// ---------------------------------------------------------------------------
export async function uploadReceivingDoc(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const countId = formData.get("countId");
  const file = formData.get("file");
  if (typeof countId !== "string" || !z.string().uuid().safeParse(countId).success) {
    return { ok: false, error: "Invalid session." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a document to upload." };
  }
  if (file.size > MAX_DOC_BYTES) {
    return { ok: false, error: "That file is too large (max 15 MB)." };
  }

  const { count } = await loadOpenRestock(countId);
  if (!count || count.kind !== "restock") return { ok: false, error: "Session not found." };
  if (count.status !== "open") return { ok: false, error: "This session is already received." };

  const service = createServiceClient();
  const path = `${count.location_id}/${countId}/${file.name}`;
  const upload = await service.storage
    .from(BUCKET)
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
  if (upload.error) return { ok: false, error: upload.error.message };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("inventory_counts")
    .update({ document_path: path })
    .eq("id", countId);
  if (error) return { ok: false, error: dbError(error) };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. Extract line items from the stored document (CSV parse or AI for PDF/photo)
// ---------------------------------------------------------------------------
function mediaKind(path: string, blobType: string): "csv" | "pdf" | "image" | "other" {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv" || blobType.includes("csv") || blobType === "text/plain") return "csv";
  if (ext === "pdf" || blobType === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "heic"].includes(ext) || blobType.startsWith("image/")) return "image";
  return "other";
}

export async function extractDocument(
  input: unknown,
): Promise<ActionResult<{ lines: ExtractedLine[] }>> {
  await requireAdmin();
  const parsed = z.object({ countId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const { count } = await loadOpenRestock(parsed.data.countId);
  if (!count || count.kind !== "restock") return { ok: false, error: "Session not found." };
  if (!count.document_path) return { ok: false, error: "Upload a document first." };

  const service = createServiceClient();
  const dl = await service.storage.from(BUCKET).download(count.document_path);
  if (dl.error || !dl.data) return { ok: false, error: "Could not read the uploaded document." };
  const blob = dl.data;
  const kind = mediaKind(count.document_path, blob.type);

  try {
    if (kind === "csv") {
      const text = await blob.text();
      const parsedCsv = Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
      });
      return { ok: true, data: { lines: mapCsvRows(parsedCsv.data) } };
    }
    if (kind === "pdf" || kind === "image") {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mediaType = kind === "pdf" ? "application/pdf" : blob.type || "image/jpeg";
      const lines = await extractLinesFromDocument(bytes, mediaType);
      return { ok: true, data: { lines } };
    }
    return { ok: false, error: "Unsupported file type — use CSV, PDF, or an image." };
  } catch (err) {
    const message =
      err instanceof Error && /gateway|api key|unauthorized|model/i.test(err.message)
        ? "AI extraction isn't configured — set AI_GATEWAY_API_KEY, or upload a CSV."
        : "Could not extract line items from that document.";
    return { ok: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// 4. Commit the reviewed lines → matched count items (barcode then SKU)
// ---------------------------------------------------------------------------
const commitSchema = z.object({
  countId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(60),
        codeType: z.enum(["barcode", "sku", "unknown"]),
        description: z.string().trim().max(300).default(""),
        qty: z.number().int().min(1).max(1_000_000),
      }),
    )
    .min(1)
    .max(2000),
});

async function resolveLine(line: ExtractedLine): Promise<VariantHit | null> {
  if (!isShopifyConfigured()) return null;
  const tryBarcode = () => lookupVariantByBarcode(line.code).catch(() => null);
  const trySku = () => lookupVariantBySku(line.code).catch(() => null);
  const first = line.codeType === "sku" ? trySku : tryBarcode;
  const second = line.codeType === "sku" ? tryBarcode : trySku;
  return (await first()) ?? (await second());
}

export async function commitExtraction(input: unknown): Promise<ActionResult<{ matched: number; unmatched: number }>> {
  await requireAdmin();
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { countId, lines } = parsed.data;

  const { supabase, count } = await loadOpenRestock(countId);
  if (!count || count.kind !== "restock") return { ok: false, error: "Session not found." };
  if (count.status !== "open") return { ok: false, error: "This session is already received." };

  // Resolve every line, then collapse duplicates onto one row per barcode
  // (a document may list the same variant twice) summing the document qty.
  type Row = {
    barcode: string;
    sku: string | null;
    product_title: string;
    variant_title: string | null;
    expected: number | null;
    doc_qty: number;
    unknown: boolean;
  };
  const byBarcode = new Map<string, Row>();
  for (const line of lines) {
    const hit = await resolveLine(line);
    const barcode = hit?.barcode || line.code;
    const existing = byBarcode.get(barcode);
    if (existing) {
      existing.doc_qty += line.qty;
      continue;
    }
    byBarcode.set(barcode, {
      barcode,
      sku: hit?.sku ?? null,
      product_title: hit?.productTitle ?? line.description ?? "Unmatched line",
      variant_title: hit?.variantTitle ?? null,
      expected: hit?.inventoryQuantity ?? null,
      doc_qty: line.qty,
      unknown: !hit,
    });
  }

  // Re-committing replaces the session's items (idempotent review edits).
  await supabase.from("inventory_count_items").delete().eq("count_id", countId);
  const rows = [...byBarcode.values()].map((r) => ({
    count_id: countId,
    barcode: r.barcode,
    sku: r.sku,
    product_title: r.product_title,
    variant_title: r.variant_title,
    qty: 0, // arrived is filled by physical verification
    doc_qty: r.doc_qty,
    expected: r.expected,
    unknown: r.unknown,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("inventory_count_items").insert(rows.slice(i, i + 500));
    if (error) return { ok: false, error: dbError(error) };
  }

  revalidatePath(`/admin/inventory/${countId}`);
  const unmatched = rows.filter((r) => r.unknown).length;
  return { ok: true, data: { matched: rows.length - unmatched, unmatched } };
}

// ---------------------------------------------------------------------------
// 5. Manually resolve a flagged (unmatched) line by barcode
// ---------------------------------------------------------------------------
const matchSchema = z.object({
  itemId: z.string().uuid(),
  barcode: z.string().trim().min(4).max(60),
});

export async function matchUnknownItem(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = matchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (!isShopifyConfigured()) return { ok: false, error: "Shopify isn't connected." };

  const hit = await lookupVariantByBarcode(parsed.data.barcode).catch(() => null);
  if (!hit) return { ok: false, error: "That barcode isn't in the Shopify catalog." };

  const supabase = await createServerClient();
  const { data: item } = await supabase
    .from("inventory_count_items")
    .select("id, inventory_counts(status, kind)")
    .eq("id", parsed.data.itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Row not found." };
  if (item.inventory_counts?.status !== "open") {
    return { ok: false, error: "This session is already received." };
  }

  const { error } = await supabase
    .from("inventory_count_items")
    .update({
      barcode: hit.barcode,
      sku: hit.sku,
      product_title: hit.productTitle,
      product_type: hit.productType,
      variant_title: hit.variantTitle,
      expected: hit.inventoryQuantity,
      unknown: false,
    })
    .eq("id", parsed.data.itemId);
  if (error) return { ok: false, error: dbError(error, { "23505": "That barcode is already in this session." }) };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 6. Receive: ADD arrived to current Shopify on-hand, then close the session
// ---------------------------------------------------------------------------
export async function receiveStock(countId: string): Promise<ActionResult<{ received: number; skipped: number }>> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(countId).success) {
    return { ok: false, error: "Invalid session." };
  }
  if (!isShopifyConfigured()) return { ok: false, error: "Shopify isn't connected." };

  const { supabase, count } = await loadOpenRestock(countId);
  if (!count || count.kind !== "restock") return { ok: false, error: "Session not found." };
  if (count.status !== "open") return { ok: false, error: "This session is already received." };

  let shopifyLocations;
  try {
    shopifyLocations = await fetchShopifyLocations();
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  if (shopifyLocations.length === 0) return { ok: false, error: "Shopify reports no active locations." };
  if (shopifyLocations.length > 1) {
    return { ok: false, error: "Shopify has multiple locations — location mapping isn't supported yet." };
  }
  const shopifyLocation = shopifyLocations[0];

  let scopes;
  try {
    scopes = await fetchAppAccessScopes();
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  if (!scopes.includes("write_inventory")) {
    return {
      ok: false,
      error: "The Shopify app token doesn't have write_inventory yet — add the scope in the Shopify admin, then retry.",
    };
  }

  const { data: itemRows } = await supabase
    .from("inventory_count_items")
    .select("barcode, sku, product_title, product_type, variant_title, expected, doc_qty, qty, unknown")
    .eq("count_id", countId);
  type ItemRow = ReceivingItem & { product_type: string | null };
  const items = (itemRows ?? []) as ItemRow[];

  // Fresh on-hand right now — arrivals add on top of the *current* stock, not
  // the snapshot taken when the document was matched (sales may have happened).
  let variants;
  try {
    variants = await fetchVariantsForPush(shopifyLocation.id);
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  const freshByBarcode = new Map(
    variants.map((v) => [v.barcode, { inventoryItemId: v.inventoryItemId, onHand: v.onHand }]),
  );
  const writes = buildReceivingWrites(items, freshByBarcode);
  const skipped = items.filter((i) => !i.unknown && i.qty > 0).length - writes.length;
  if (writes.length === 0) {
    return { ok: false, error: "Nothing to receive — scan the arrivals first (matched items only)." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://livesportswear.vercel.app";
  const refUri = `${appUrl}/admin/inventory/${countId}`;
  let result;
  try {
    result = await setOnHandQuantities(
      shopifyLocation.id,
      writes.map((w) => ({ inventoryItemId: w.inventoryItemId, quantity: w.quantity })),
      refUri,
    );
  } catch (err) {
    result = { ok: false as const, message: err instanceof Error ? err.message : UNREACHABLE, failedIndexes: [] };
  }
  if (!result.ok) return { ok: false, error: result.message };

  // Keep our book in step: the received barcodes now hold the merged total.
  const writtenQty = new Map(writes.map((w) => [w.barcode, w.quantity]));
  const now = new Date().toISOString();
  const bookRows = items
    .filter((i) => writtenQty.has(i.barcode))
    .map((i) => ({
      location_id: count.location_id,
      barcode: i.barcode,
      sku: i.sku,
      product_title: i.product_title,
      product_type: i.product_type ?? null,
      variant_title: i.variant_title,
      qty: writtenQty.get(i.barcode)!,
      shopify_qty: writtenQty.get(i.barcode)!,
      unknown: false,
      counted_at: now,
      count_id: countId,
    }));
  for (let i = 0; i < bookRows.length; i += 500) {
    await supabase
      .from("store_inventory")
      .upsert(bookRows.slice(i, i + 500), { onConflict: "location_id,barcode" });
  }

  const receivedUnits = items.reduce((sum, i) => (writtenQty.has(i.barcode) ? sum + i.qty : sum), 0);
  const { data: closed } = await supabase
    .from("inventory_counts")
    .update({ status: "final", finalized_at: now, counted_units: receivedUnits })
    .eq("id", countId)
    .eq("status", "open")
    .select("id");
  if (!closed?.length) return { ok: false, error: "This session is already received." };

  revalidatePath("/admin/inventory", "layout");
  return { ok: true, data: { received: writes.length, skipped: Math.max(0, skipped) } };
}
