"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { isShopifyConfigured } from "@/lib/shopify-config";
import {
  fetchAppAccessScopes,
  fetchShopifyLocations,
  fetchVariantsForPush,
  setOnHandQuantities,
} from "@/lib/shopify";
import { buildPushPlan } from "@/lib/inventory-push";
import { type ActionResult, firstError, dbError } from "@/server/shared";

const ONE_DRAFT = {
  "23505": "This store already has a push draft — apply or discard it first.",
};

const UNREACHABLE = "Shopify is unreachable — try again in a minute.";

const buildSchema = z.object({ locationId: z.string().uuid() });

/**
 * Stage 1 of the push: diff the store's book against Shopify's CURRENT
 * on-hand and persist the correction list as a reviewable draft. Reads only —
 * nothing is written to Shopify here.
 */
export async function buildPushDraft(
  input: unknown,
): Promise<ActionResult<{ id: string; corrections: number }>> {
  const user = await requireAdmin();
  const parsed = buildSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (!isShopifyConfigured()) {
    return { ok: false, error: "Shopify isn't configured." };
  }

  let shopifyLocations;
  try {
    shopifyLocations = await fetchShopifyLocations();
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  if (shopifyLocations.length === 0) {
    return { ok: false, error: "Shopify reports no active locations." };
  }
  if (shopifyLocations.length > 1) {
    return {
      ok: false,
      error:
        "Shopify has multiple locations — location mapping isn't supported yet.",
    };
  }
  const shopifyLocation = shopifyLocations[0];

  let variants;
  try {
    variants = await fetchVariantsForPush(shopifyLocation.id);
  } catch (err) {
    const denied =
      err instanceof Error && /access|permission|denied/i.test(err.message);
    return {
      ok: false,
      error: denied
        ? "The Shopify token can't read inventory levels — check the app's scopes."
        : UNREACHABLE,
    };
  }

  const supabase = await createServerClient();
  const { data: bookRows, error: bookErr } = await supabase
    .from("store_inventory")
    .select("barcode, sku, product_title, variant_title, qty, unknown")
    .eq("location_id", parsed.data.locationId);
  if (bookErr) return { ok: false, error: dbError(bookErr) };
  if (!bookRows?.length) {
    return {
      ok: false,
      error: "This store's book is empty — finalize a count first.",
    };
  }

  const plan = buildPushPlan(bookRows, variants);

  const { data: draft, error } = await supabase
    .from("shopify_push_drafts")
    .insert({
      location_id: parsed.data.locationId,
      shopify_location_id: shopifyLocation.id,
      shopify_location_name: shopifyLocation.name,
      created_by: user.id,
      book_items: bookRows.length,
      in_sync_items: plan.inSync,
      skipped_unknown: plan.skippedUnknown.length,
      skipped_no_variant: plan.skippedNoVariant.length,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbError(error, ONE_DRAFT) };

  for (let i = 0; i < plan.corrections.length; i += 500) {
    const { error: itemErr } = await supabase
      .from("shopify_push_draft_items")
      .insert(
        plan.corrections.slice(i, i + 500).map((c) => ({
          draft_id: draft.id,
          barcode: c.barcode,
          sku: c.sku,
          product_title: c.product_title,
          variant_title: c.variant_title,
          inventory_item_id: c.inventory_item_id,
          book_qty: c.book_qty,
          shopify_qty: c.shopify_qty,
          delta: c.delta,
        })),
      );
    if (itemErr) {
      // No half-drafts: the review list must be the complete diff or nothing.
      await supabase.from("shopify_push_drafts").delete().eq("id", draft.id);
      return { ok: false, error: dbError(itemErr) };
    }
  }

  revalidatePath("/admin/inventory/push");
  return { ok: true, data: { id: draft.id, corrections: plan.corrections.length } };
}

const toggleSchema = z.object({
  itemId: z.string().uuid(),
  excluded: z.boolean(),
});

export async function togglePushItem(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { data: item } = await supabase
    .from("shopify_push_draft_items")
    .select("id, draft_id, shopify_push_drafts(status)")
    .eq("id", parsed.data.itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Row not found." };
  if (item.shopify_push_drafts?.status !== "draft") {
    return { ok: false, error: "This draft is closed." };
  }

  const { error } = await supabase
    .from("shopify_push_draft_items")
    .update({ excluded: parsed.data.excluded })
    .eq("id", parsed.data.itemId);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/inventory/push");
  return { ok: true };
}

export async function discardPushDraft(draftId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(draftId).success) {
    return { ok: false, error: "Invalid draft." };
  }
  const supabase = await createServerClient();
  const { error, count } = await supabase
    .from("shopify_push_drafts")
    .update(
      { status: "discarded", discarded_at: new Date().toISOString() },
      { count: "exact" },
    )
    .eq("id", draftId)
    .eq("status", "draft");
  if (error) return { ok: false, error: dbError(error) };
  if (!count) return { ok: false, error: "Only open drafts can be discarded." };
  revalidatePath("/admin/inventory/push");
  return { ok: true };
}

/**
 * Stage 3: the actual write. Server-side re-checks (draft open, book not
 * newer than the draft, write_inventory scope present) run regardless of what
 * the UI showed. Chunks are written sequentially; a failed chunk stops the
 * run with per-row failure records, and pressing Apply again retries only
 * what isn't written yet.
 */
export async function applyPushDraft(
  draftId: string,
): Promise<ActionResult<{ written: number }>> {
  const user = await requireAdmin();
  if (!z.string().uuid().safeParse(draftId).success) {
    return { ok: false, error: "Invalid draft." };
  }
  const supabase = await createServerClient();
  const { data: draft } = await supabase
    .from("shopify_push_drafts")
    .select("id, location_id, status, shopify_location_id, created_at")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) return { ok: false, error: "Draft not found." };
  if (draft.status !== "draft") {
    return { ok: false, error: "This draft is closed." };
  }

  const { data: newest } = await supabase
    .from("store_inventory")
    .select("counted_at")
    .eq("location_id", draft.location_id)
    .order("counted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (newest && newest.counted_at > draft.created_at) {
    return {
      ok: false,
      error:
        "A newer count was finalized after this draft — discard and rebuild it.",
    };
  }

  let scopes;
  try {
    scopes = await fetchAppAccessScopes();
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  if (!scopes.includes("write_inventory")) {
    return {
      ok: false,
      error:
        "The Shopify app token doesn't have write_inventory yet — add the scope in the Shopify admin, then retry.",
    };
  }

  const { data: items, error: itemsErr } = await supabase
    .from("shopify_push_draft_items")
    .select("id, barcode, sku, product_title, variant_title, inventory_item_id, book_qty")
    .eq("draft_id", draftId)
    .eq("excluded", false)
    .or("apply_status.is.null,apply_status.eq.failed");
  if (itemsErr) return { ok: false, error: dbError(itemsErr) };
  if (!items?.length) {
    return { ok: false, error: "Nothing to write — every row is excluded or already written." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://livesportswear.vercel.app";
  const refUri = `${appUrl}/admin/inventory/push?draft=${draftId}`;
  let written = 0;

  for (let i = 0; i < items.length; i += 250) {
    const chunk = items.slice(i, i + 250);
    let result;
    try {
      result = await setOnHandQuantities(
        draft.shopify_location_id,
        chunk.map((c) => ({
          inventoryItemId: c.inventory_item_id,
          quantity: c.book_qty,
        })),
        refUri,
      );
    } catch (err) {
      result = {
        ok: false as const,
        message: err instanceof Error ? err.message : UNREACHABLE,
        failedIndexes: [],
      };
    }

    if (!result.ok) {
      const failed = new Set(result.failedIndexes);
      await supabase
        .from("shopify_push_draft_items")
        .update({ apply_status: "failed", apply_error: result.message })
        .in(
          "id",
          chunk
            .filter((_, idx) => failed.size === 0 || failed.has(idx))
            .map((c) => c.id),
        );
      revalidatePath("/admin/inventory/push");
      return {
        ok: false,
        error: `Applied ${written} of ${items.length} rows — the rest failed: ${result.message}. Press Apply again to retry the failed rows.`,
      };
    }

    const ids = chunk.map((c) => c.id);
    await supabase
      .from("shopify_push_draft_items")
      .update({ apply_status: "written", apply_error: null })
      .in("id", ids);
    // Shopify now equals the book for these rows — keep the book's own record
    // in step. Conflict path always hits (draft rows came FROM the book), so
    // counted_at stays untouched.
    const { error: bookErr } = await supabase.from("store_inventory").upsert(
      chunk.map((c) => ({
        location_id: draft.location_id,
        barcode: c.barcode,
        sku: c.sku,
        product_title: c.product_title,
        variant_title: c.variant_title,
        qty: c.book_qty,
        shopify_qty: c.book_qty,
        unknown: false,
      })),
      { onConflict: "location_id,barcode" },
    );
    if (bookErr) return { ok: false, error: dbError(bookErr) };
    written += chunk.length;
  }

  const { error: doneErr } = await supabase
    .from("shopify_push_drafts")
    .update({
      status: "applied",
      applied_at: new Date().toISOString(),
      applied_by: user.id,
    })
    .eq("id", draftId);
  if (doneErr) return { ok: false, error: dbError(doneErr) };

  revalidatePath("/admin/inventory/push");
  revalidatePath("/admin/inventory/book");
  revalidatePath("/admin/inventory");
  return { ok: true, data: { written } };
}
