import { isPosOrder } from "@/lib/orders-today";
import type { DayOrder } from "@/lib/shopify";

/**
 * Which rep brought each client in, reduced from raw order history. Pure — no
 * DB, no network, no clock, so the whole attribution rule is unit-testable.
 *
 * The rule: a customer belongs to the staff member on their EARLIEST real POS
 * order. Drafts, cancelled and test orders never count (they'd hand a client to
 * whoever happened to open a draft), and orders with no customer are anonymous
 * walk-ins that belong to nobody.
 *
 * Callers feed pages in as they arrive; the accumulator keeps one row per
 * customer, so memory stays flat over the full history.
 */

export type Origin = {
  orderId: string;
  orderName: string;
  at: string; // ISO instant of the first order
  staffId: string | null;
};

export type OriginMap = Map<string, Origin>;

/** Folds a page of orders into the accumulator, keeping the earliest per customer. */
export function accumulateOrigins(orders: DayOrder[], into: OriginMap = new Map()): OriginMap {
  for (const o of orders) {
    if (!isPosOrder(o)) continue;
    const customerId = o.customer?.id;
    if (!customerId) continue;

    const existing = into.get(customerId);
    if (existing && existing.at <= o.createdAt) continue;

    into.set(customerId, {
      orderId: o.id,
      orderName: o.name,
      at: o.createdAt,
      staffId: o.staffId,
    });
  }
  return into;
}

/** One-shot convenience over a complete order list. */
export const earliestByCustomer = (orders: DayOrder[]): OriginMap =>
  accumulateOrigins(orders);

/**
 * Staff ids that appear in the attribution but map to no employee — people who
 * have left, or reps not yet linked to their Shopify staff account. Surfaced by
 * the backfill so the gap is visible rather than silently unattributed.
 */
export function unmappedStaffIds(
  origins: OriginMap,
  mappedStaffIds: Set<string>,
): string[] {
  const missing = new Set<string>();
  for (const o of origins.values()) {
    if (o.staffId && !mappedStaffIds.has(o.staffId)) missing.add(o.staffId);
  }
  return [...missing].sort();
}
