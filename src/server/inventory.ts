"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { isShopifyConfigured } from "@/lib/shopify-config";
import {
  lookupVariantByBarcode,
  fetchAllTrackedVariants,
} from "@/lib/shopify";
import { countTotals, type CountItem } from "@/lib/inventory-count";
import { type ActionResult, firstError, dbError } from "@/server/shared";
import type { InventoryCountItem } from "@/types/db";

const ONE_OPEN = {
  "23505": "This store already has an open count — finish or delete it first.",
};

const startSchema = z.object({
  locationId: z.string().uuid(),
  note: z.string().trim().max(300).optional(),
});

export async function startCount(
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
      note: parsed.data.note || null,
      started_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbError(error, ONE_OPEN) };
  revalidatePath("/admin/inventory");
  return { ok: true, data: { id: data.id } };
}

const scanSchema = z.object({
  countId: z.string().uuid(),
  // EAN/UPC are digits, but keep it permissive — some catalogs use alphanumerics.
  barcode: z.string().trim().min(4).max(60),
});

/** One scan = +1 on that barcode's row; first scan resolves it in Shopify. */
export async function scanBarcode(
  input: unknown,
): Promise<ActionResult<InventoryCountItem>> {
  await requireAdmin();
  const parsed = scanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { countId, barcode } = parsed.data;

  const supabase = await createServerClient();
  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id, status")
    .eq("id", countId)
    .maybeSingle();
  if (!count) return { ok: false, error: "Count not found." };
  if (count.status !== "open") {
    return { ok: false, error: "This count is finalized — start a new one." };
  }

  const { data: existing } = await supabase
    .from("inventory_count_items")
    .select("id, qty")
    .eq("count_id", countId)
    .eq("barcode", barcode)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("inventory_count_items")
      .update({ qty: existing.qty + 1 })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return { ok: false, error: dbError(error) };
    return { ok: true, data };
  }

  const hit = isShopifyConfigured()
    ? await lookupVariantByBarcode(barcode).catch(() => null)
    : null;
  const { data, error } = await supabase
    .from("inventory_count_items")
    .insert({
      count_id: countId,
      barcode,
      sku: hit?.sku ?? null,
      product_title: hit?.productTitle ?? "Unknown barcode",
      variant_title: hit?.variantTitle ?? null,
      qty: 1,
      expected: hit?.inventoryQuantity ?? null,
      unknown: !hit,
    })
    .select()
    .single();
  if (error) return { ok: false, error: dbError(error) };
  return { ok: true, data };
}

const adjustSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().int().min(0).max(100_000),
});

export async function adjustItem(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("inventory_count_items")
    .update({ qty: parsed.data.qty })
    .eq("id", parsed.data.itemId);
  if (error) return { ok: false, error: dbError(error) };
  return { ok: true };
}

export async function removeItem(itemId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(itemId).success) {
    return { ok: false, error: "Invalid item." };
  }
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("inventory_count_items")
    .delete()
    .eq("id", itemId);
  if (error) return { ok: false, error: dbError(error) };
  return { ok: true };
}

/**
 * Close the count: sweep the whole catalog so every tracked variant that was
 * never scanned appears as a missing (qty 0) row, then snapshot the totals.
 */
export async function finalizeCount(countId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(countId).success) {
    return { ok: false, error: "Invalid count." };
  }
  const supabase = await createServerClient();
  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id, status")
    .eq("id", countId)
    .maybeSingle();
  if (!count) return { ok: false, error: "Count not found." };
  if (count.status !== "open") return { ok: false, error: "Already finalized." };

  if (isShopifyConfigured()) {
    let catalog;
    try {
      catalog = await fetchAllTrackedVariants();
    } catch {
      return {
        ok: false,
        error: "Shopify is unreachable — try finalizing again in a minute.",
      };
    }
    const { data: scanned } = await supabase
      .from("inventory_count_items")
      .select("barcode")
      .eq("count_id", countId);
    const seen = new Set((scanned ?? []).map((s) => s.barcode));
    const missing = catalog.filter(
      (v) => !seen.has(v.barcode) && (v.inventoryQuantity ?? 0) > 0,
    );
    // Chunked inserts — the sweep can add hundreds of rows on a first count.
    for (let i = 0; i < missing.length; i += 500) {
      const { error } = await supabase.from("inventory_count_items").insert(
        missing.slice(i, i + 500).map((v) => ({
          count_id: countId,
          barcode: v.barcode,
          sku: v.sku,
          product_title: v.productTitle,
          variant_title: v.variantTitle,
          qty: 0,
          expected: v.inventoryQuantity,
          unknown: false,
        })),
      );
      if (error) return { ok: false, error: dbError(error) };
    }
  }

  const { data: items } = await supabase
    .from("inventory_count_items")
    .select("barcode, sku, product_title, variant_title, qty, expected, unknown")
    .eq("count_id", countId);
  const totals = countTotals((items ?? []) as CountItem[]);

  const finalizedAt = new Date().toISOString();
  const { data: finalized, error } = await supabase
    .from("inventory_counts")
    .update({
      status: "final",
      finalized_at: finalizedAt,
      counted_units: totals.countedUnits,
      expected_units: totals.expectedUnits,
    })
    .eq("id", countId)
    .select("location_id")
    .single();
  if (error) return { ok: false, error: dbError(error) };

  // The finalized count becomes the store's inventory book: our counted
  // truth per barcode, zeros included (a total count establishes zeros).
  const bookRows = (items ?? []).map((it) => ({
    location_id: finalized.location_id,
    barcode: it.barcode,
    sku: it.sku,
    product_title: it.product_title,
    variant_title: it.variant_title,
    qty: it.qty,
    shopify_qty: it.expected,
    unknown: it.unknown,
    counted_at: finalizedAt,
    count_id: countId,
  }));
  for (let i = 0; i < bookRows.length; i += 500) {
    const { error: bookErr } = await supabase
      .from("store_inventory")
      .upsert(bookRows.slice(i, i + 500), { onConflict: "location_id,barcode" });
    if (bookErr) return { ok: false, error: dbError(bookErr) };
  }

  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function deleteCount(countId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(countId).success) {
    return { ok: false, error: "Invalid count." };
  }
  const supabase = await createServerClient();
  // Open counts only — a finalized count is an immutable record.
  const { error, count } = await supabase
    .from("inventory_counts")
    .delete({ count: "exact" })
    .eq("id", countId)
    .eq("status", "open");
  if (error) return { ok: false, error: dbError(error) };
  if (!count) return { ok: false, error: "Only open counts can be deleted." };
  revalidatePath("/admin/inventory");
  return { ok: true };
}
