"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { firstError, dbError, type ActionResult } from "@/server/shared";

const uuid = z.string().uuid();

/**
 * Kiosk-side receiving: the store iPad counts an arrival the admin has already
 * uploaded + matched (status 'counting'). The kiosk is a trusted per-location
 * device with no employees row — it acts through the service client, and EVERY
 * write is re-scoped to the JWT's location and to a restock session that is
 * actually in 'counting'. Matching to Shopify and the final push stay admin-only.
 */
async function receivingCtx() {
  const { locationId } = await requireStore();
  return { locationId, service: createServiceClient() };
}

type CountRow = { id: string; location_id: string; kind: string; status: string };

/** Load a restock session the kiosk may write to (its location, in 'counting'). */
async function loadCounting(
  service: ReturnType<typeof createServiceClient>,
  locationId: string,
  countId: string,
): Promise<CountRow | null> {
  if (!uuid.safeParse(countId).success) return null;
  const { data } = await service
    .from("inventory_counts")
    .select("id, location_id, kind, status")
    .eq("id", countId)
    .maybeSingle();
  if (!data || data.location_id !== locationId || data.kind !== "restock" || data.status !== "counting") {
    return null;
  }
  return data as CountRow;
}

// ---------------------------------------------------------------------------
// Set the counted quantity for one size line (a single matrix cell).
// ---------------------------------------------------------------------------
const setQtySchema = z.object({
  countId: uuid,
  itemId: uuid,
  qty: z.number().int().min(0).max(1_000_000),
});

export async function storeSetCountedQty(input: unknown): Promise<ActionResult> {
  const { locationId, service } = await receivingCtx();
  const parsed = setQtySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { countId, itemId, qty } = parsed.data;

  const count = await loadCounting(service, locationId, countId);
  if (!count) return { ok: false, error: "This arrival isn't open for counting." };

  // Scope to this session's rows, matched only — an unknown line has no variant
  // to receive into, so it isn't countable.
  const { data: updated, error } = await service
    .from("inventory_count_items")
    .update({ qty })
    .eq("id", itemId)
    .eq("count_id", countId)
    .eq("unknown", false)
    .select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (!updated?.length) return { ok: false, error: "That line isn't countable." };
  revalidatePath("/store/receiving");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Mark a reference counted / not counted (tick the whole (reference,color) row).
// ---------------------------------------------------------------------------
const toggleSchema = z.object({
  countId: uuid,
  itemIds: z.array(uuid).min(1).max(200),
  counted: z.boolean(),
});

export async function storeToggleCounted(input: unknown): Promise<ActionResult> {
  const { locationId, service } = await receivingCtx();
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { countId, itemIds, counted } = parsed.data;

  const count = await loadCounting(service, locationId, countId);
  if (!count) return { ok: false, error: "This arrival isn't open for counting." };

  const { data: updated, error } = await service
    .from("inventory_count_items")
    .update({ verified: counted })
    .eq("count_id", countId)
    .eq("unknown", false)
    .in("id", itemIds)
    .select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (!updated?.length) return { ok: false, error: "Nothing to mark on this reference." };
  revalidatePath("/store/receiving");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Hand the finished count back to the admin to push (status counting → ready).
// ---------------------------------------------------------------------------
export async function storeMarkReadyToPush(countId: string): Promise<ActionResult> {
  const { locationId, service } = await receivingCtx();
  const count = await loadCounting(service, locationId, countId);
  if (!count) return { ok: false, error: "This arrival isn't open for counting." };

  const { data: items } = await service
    .from("inventory_count_items")
    .select("verified")
    .eq("count_id", countId)
    .eq("unknown", false);
  const matched = items ?? [];
  if (matched.length === 0) return { ok: false, error: "Nothing to count on this arrival." };
  if (matched.some((i) => !i.verified)) {
    return { ok: false, error: "Count and tick every reference before marking it ready." };
  }

  const { error } = await service
    .from("inventory_counts")
    .update({ status: "ready" })
    .eq("id", countId)
    .eq("status", "counting");
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/store/receiving");
  revalidatePath(`/admin/inventory/${countId}`);
  return { ok: true };
}
