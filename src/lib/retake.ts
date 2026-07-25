/**
 * Re-taking a client the rep already attended today, without counting the same
 * person twice (which would inflate attended and depress conversion). Two
 * outcomes:
 *
 * - **Bought** — the purchase is ADDED to the attendance already logged. Money
 *   and orders merge (dedupe by id, sum totals); a re-take can link more orders
 *   onto the sale.
 * - **No sale** — the client came back but didn't buy. Nothing double-counts;
 *   optionally the contact captured on this visit is recorded. A real sale is
 *   never downgraded.
 *
 * Pure: no DB, no network, no clock.
 */

import { mergeLinkedOrders, type LinkedOrder } from "@/lib/linked-orders";

export type RetakeOrder = LinkedOrder;

export type ExistingEvent = {
  sold: boolean;
  got_contact: boolean;
  order_total: number | string | null;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  shopify_customer_id: string | null;
  customer_name: string | null;
  linked_orders: LinkedOrder[] | null;
};

export type RetakeOutcome =
  | { sold: true; orders: RetakeOrder[]; gotContact?: boolean }
  | { sold: false; gotContact?: boolean };

export type RetakePatch = {
  sold: boolean;
  got_contact?: boolean;
  order_total?: number;
  linked_orders?: LinkedOrder[] | null;
  shopify_order_id?: string | null;
  shopify_order_name?: string | null;
  shopify_customer_id?: string | null;
  customer_name?: string | null;
};

// A prior sale reconstructed from the legacy single columns carries this
// sentinel id: it holds the earlier money but is not a real Shopify order
// reference, so it never becomes the primary link or collides with a picked id.
const PRIOR = "__prior__";

/**
 * The orders already on the event. Prefer the stored `linked_orders`; fall back
 * to reconstructing one from the legacy single columns so a re-take onto a
 * pre-`linked_orders` row still adds to (never drops) the earlier money.
 */
function existingOrders(existing: ExistingEvent): LinkedOrder[] {
  if (existing.linked_orders && existing.linked_orders.length > 0) {
    return existing.linked_orders;
  }
  const prior = Number(existing.order_total ?? 0) || 0;
  if (prior <= 0 && !existing.shopify_order_id) return [];
  return [
    {
      id: existing.shopify_order_id ?? PRIOR,
      name: existing.shopify_order_name ?? "",
      total: prior,
      customer_id: existing.shopify_customer_id,
      customer_name: existing.customer_name,
    },
  ];
}

export function retakePatch(
  existing: ExistingEvent,
  outcome: RetakeOutcome,
): RetakePatch {
  // Came back, still didn't buy: never downgrade a real sale, just capture any
  // contact obtained this time. Orders/money left untouched.
  if (!outcome.sold) {
    return {
      sold: existing.sold,
      got_contact: existing.got_contact || !!outcome.gotContact,
    };
  }

  const merged = mergeLinkedOrders(existingOrders(existing), outcome.orders);
  const real = merged.linked_orders.filter((o) => o.id !== PRIOR);
  const ref = real[0] ?? null;
  // First real order carrying each customer field — fills a gap when the
  // original attendance had no customer but a newly linked order does.
  const firstWith = (k: keyof LinkedOrder): string | null => {
    for (const o of real) {
      const v = o[k];
      if (v != null) return v as string;
    }
    return null;
  };

  return {
    sold: true,
    ...(outcome.gotContact ? { got_contact: true } : {}),
    order_total: merged.order_total,
    linked_orders: merged.linked_orders.length > 0 ? merged.linked_orders : null,
    // Fill gaps only — a re-take can never blank contact captured earlier.
    shopify_order_id: existing.shopify_order_id ?? ref?.id ?? null,
    shopify_order_name: existing.shopify_order_name ?? ref?.name ?? null,
    shopify_customer_id: existing.shopify_customer_id ?? firstWith("customer_id"),
    customer_name: existing.customer_name ?? firstWith("customer_name"),
  };
}
