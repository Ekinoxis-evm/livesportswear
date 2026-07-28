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
  fetchAllTrackedVariants,
  fetchAppAccessScopes,
  fetchShopifyLocations,
  fetchVariantsForPush,
  setOnHandQuantities,
  type VariantHit,
} from "@/lib/shopify";
import {
  mapCsvRows,
  gridToRows,
  buildReceivingWrites,
  buildReferenceIndex,
  matchByReference,
  candidateColors,
  type ExtractedLine,
  type ReceivingItem,
} from "@/lib/receiving";
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
  // Sanitize the client-supplied filename to a bare basename — never let a
  // crafted name with path separators escape the count's storage prefix.
  const safeName = (file.name.split(/[\\/]/).pop() || "document").replace(/[^\w.\-]+/g, "_");
  const path = `${count.location_id}/${countId}/${safeName}`;
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
function mediaKind(
  path: string,
  blobType: string,
): "csv" | "xlsx" | "pdf" | "image" | "other" {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv" || blobType.includes("csv") || blobType === "text/plain") return "csv";
  if (ext === "xlsx" || ext === "xls" || blobType.includes("spreadsheetml") || blobType.includes("ms-excel"))
    return "xlsx";
  if (ext === "pdf" || blobType === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "heic"].includes(ext) || blobType.startsWith("image/")) return "image";
  return "other";
}

/**
 * An .xlsx (supplier invoice) → extracted lines. Reads every sheet, keeps the
 * one that yields the most lines: the workbook usually has a title/cover sheet
 * and the line data on another (the invoice's data is on its "invoice" sheet).
 */
async function extractXlsx(blob: Blob): Promise<ExtractedLine[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());

  let best: ExtractedLine[] = [];
  wb.eachSheet((ws) => {
    const grid: unknown[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        let v: unknown = cell.value;
        if (v && typeof v === "object" && "richText" in v) {
          v = (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
        } else if (v && typeof v === "object" && "result" in v) {
          v = (v as { result: unknown }).result; // formula → its computed value
        }
        cells[col - 1] = v;
      });
      grid.push(cells);
    });
    const lines = mapCsvRows(gridToRows(grid));
    if (lines.length > best.length) best = lines;
  });
  return best;
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
    if (kind === "xlsx") {
      return { ok: true, data: { lines: await extractXlsx(blob) } };
    }
    if (kind === "pdf" || kind === "image") {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const mediaType = kind === "pdf" ? "application/pdf" : blob.type || "image/jpeg";
      const lines = await extractLinesFromDocument(bytes, mediaType);
      return { ok: true, data: { lines } };
    }
    return { ok: false, error: "Unsupported file type — use CSV, XLSX, PDF, or an image." };
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
        hsCode: z.string().trim().max(20).optional(),
      }),
    )
    .min(1)
    .max(2000),
});

export async function commitExtraction(input: unknown): Promise<ActionResult<{ matched: number; unmatched: number }>> {
  await requireAdmin();
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { countId, lines } = parsed.data;

  const { supabase, count } = await loadOpenRestock(countId);
  if (!count || count.kind !== "restock") return { ok: false, error: "Session not found." };
  if (count.status !== "open") return { ok: false, error: "This session is already received." };

  // Match against the catalog fetched ONCE (a packing slip can have hundreds of
  // lines — a Shopify lookup per line would blow the serverless timeout). Try an
  // EXACT barcode/SKU first, then fall back to reference+size matching: the doc's
  // color text rarely equals Shopify's color code, so the assembled SKU misses —
  // but the 4-5 char reference + size resolves the variant reliably, with the
  // color only needed to disambiguate a reference that has several colors.
  const catalog = isShopifyConfigured() ? await fetchAllTrackedVariants().catch(() => []) : [];
  const byBc = new Map(catalog.map((v) => [v.barcode, v] as const));
  const bySku = new Map(
    catalog.filter((v) => v.sku).map((v) => [v.sku as string, v] as const),
  );
  const byReference = buildReferenceIndex(catalog);
  // A miss carries a hint (candidate colors / "not in Shopify") so the review
  // can tell a genuinely-missing reference from a colour ambiguity.
  const resolve = (line: ExtractedLine): { hit: VariantHit | null; hint: string | null } => {
    const exact =
      line.codeType === "sku"
        ? bySku.get(line.code) ?? byBc.get(line.code)
        : byBc.get(line.code) ?? bySku.get(line.code);
    if (exact) return { hit: exact, hint: null };

    const ref = matchByReference(line.code, byReference);
    if (ref.status === "matched") return { hit: ref.variant, hint: null };
    if (ref.status === "ambiguous") {
      return { hit: null, hint: `In Shopify as ${candidateColors(ref.candidates).join(", ")} — pick the colour` };
    }
    return { hit: null, hint: ref.reference ? `Reference ${ref.reference} not found in Shopify` : null };
  };

  // Resolve every line, then collapse duplicates onto one row per barcode
  // (a document may list the same variant twice) summing the document qty.
  type Row = {
    barcode: string;
    sku: string | null;
    product_title: string;
    variant_title: string | null;
    expected: number | null;
    doc_qty: number;
    hs_code: string | null;
    unknown: boolean;
  };
  const byBarcode = new Map<string, Row>();
  for (const line of lines) {
    const { hit, hint } = resolve(line);
    const barcode = hit?.barcode || line.code;
    const existing = byBarcode.get(barcode);
    if (existing) {
      existing.doc_qty += line.qty;
      if (!existing.hs_code && line.hsCode) existing.hs_code = line.hsCode; // keep first non-empty
      continue;
    }
    byBarcode.set(barcode, {
      barcode,
      sku: hit?.sku ?? null,
      product_title: hit?.productTitle ?? line.description ?? "Unmatched line",
      // Matched → the variant's title (usually the size); miss → the review
      // hint so the admin can see whether it's a colour ambiguity or missing.
      variant_title: hit?.variantTitle ?? hint,
      expected: hit?.inventoryQuantity ?? null,
      doc_qty: line.qty,
      hs_code: line.hsCode ?? null,
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
    hs_code: r.hs_code,
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
// 5c. Hand the matched session to the kiosk for physical counting, or pull it
//     back to keep editing. The kiosk counts arrived units per size; the admin
//     resolves matches (open) and pushes (ready) — those stay admin-only.
// ---------------------------------------------------------------------------
export async function sendToKioskCounting(countId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(countId).success) return { ok: false, error: "Invalid session." };

  const { supabase, count } = await loadOpenRestock(countId);
  if (!count || count.kind !== "restock") return { ok: false, error: "Session not found." };
  if (count.status !== "open") return { ok: false, error: "This session isn't open for editing." };

  const { count: matched } = await supabase
    .from("inventory_count_items")
    .select("id", { count: "exact", head: true })
    .eq("count_id", countId)
    .eq("unknown", false);
  if (!matched) return { ok: false, error: "Match at least one line to Shopify before counting." };

  // Reset counted state so the kiosk starts from zero (a prior admin tick or a
  // reopened count must not pre-fill arrived quantities).
  const { error: reset } = await supabase
    .from("inventory_count_items")
    .update({ qty: 0, verified: false })
    .eq("count_id", countId);
  if (reset) return { ok: false, error: dbError(reset) };

  const { error } = await supabase
    .from("inventory_counts")
    .update({ status: "counting" })
    .eq("id", countId)
    .eq("status", "open");
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath(`/admin/inventory/${countId}`);
  revalidatePath("/store/receiving");
  return { ok: true };
}

export async function reopenReceiving(countId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(countId).success) return { ok: false, error: "Invalid session." };

  const { supabase, count } = await loadOpenRestock(countId);
  if (!count || count.kind !== "restock") return { ok: false, error: "Session not found." };
  if (count.status !== "counting" && count.status !== "ready") {
    return { ok: false, error: "Only a counting session can be reopened." };
  }

  const { error } = await supabase
    .from("inventory_counts")
    .update({ status: "open" })
    .eq("id", countId)
    .in("status", ["counting", "ready"]);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath(`/admin/inventory/${countId}`);
  revalidatePath("/store/receiving");
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
  if (count.status !== "ready") {
    return { ok: false, error: "The kiosk hasn't finished counting this arrival yet." };
  }

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

  // Claim the session BEFORE writing: flip open→final atomically so a
  // double-submit or retry can't add the same arrivals twice (the additive
  // write isn't naturally idempotent). If the first write fails with nothing
  // sent, we reopen it so the admin can retry cleanly.
  const now = new Date().toISOString();
  const qtyByBarcode = new Map(items.map((i) => [i.barcode, i.qty]));
  const receivedUnits = writes.reduce((sum, w) => sum + (qtyByBarcode.get(w.barcode) ?? 0), 0);
  const { data: claimed } = await supabase
    .from("inventory_counts")
    .update({ status: "final", finalized_at: now, counted_units: receivedUnits })
    .eq("id", countId)
    .eq("status", "ready")
    .select("id");
  if (!claimed?.length) return { ok: false, error: "This session is already received." };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://livesportswear.vercel.app";
  const refUri = `${appUrl}/admin/inventory/${countId}`;

  // Shopify caps the mutation input — chunk to <=250 like the push flow.
  let written = 0;
  for (let i = 0; i < writes.length; i += 250) {
    const chunk = writes.slice(i, i + 250);
    let result;
    try {
      result = await setOnHandQuantities(
        shopifyLocation.id,
        chunk.map((w) => ({ inventoryItemId: w.inventoryItemId, quantity: w.quantity })),
        refUri,
      );
    } catch (err) {
      result = { ok: false as const, message: err instanceof Error ? err.message : UNREACHABLE, failedIndexes: [] };
    }
    if (!result.ok) {
      if (i === 0) {
        // Nothing landed — return to 'ready' so the receive can be retried
        // cleanly (the kiosk's count is intact; only the push failed).
        await supabase
          .from("inventory_counts")
          .update({ status: "ready", finalized_at: null })
          .eq("id", countId);
        return { ok: false, error: result.message };
      }
      // Earlier chunks already wrote; staying closed avoids re-adding them on a
      // retry. The remainder must be reconciled manually.
      return {
        ok: false,
        error: `Received ${written} of ${writes.length} items, then Shopify failed (${result.message}). The session was closed to avoid double-counting — reconcile the rest manually.`,
      };
    }
    written += chunk.length;
  }

  // Keep our book in step: the received barcodes now hold the merged total.
  // Best-effort — Shopify is already correct, so a book miss only leaves drift
  // visible on /admin/inventory/book; log it rather than fail the receive.
  const writtenQty = new Map(writes.map((w) => [w.barcode, w.quantity]));
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
    const { error: bookErr } = await supabase
      .from("store_inventory")
      .upsert(bookRows.slice(i, i + 500), { onConflict: "location_id,barcode" });
    if (bookErr) console.error(`[receive] book upsert failed for ${countId}: ${bookErr.message}`);
  }

  revalidatePath("/admin/inventory", "layout");
  return { ok: true, data: { received: writes.length, skipped: Math.max(0, skipped) } };
}
