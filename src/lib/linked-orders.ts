/**
 * Merging the Shopify orders linked to one sold client event.
 *
 * A client can buy in several separate orders on one visit, and a re-take can
 * add more orders to a sale already logged. Both need the same rule: combine
 * the orders, dedupe by id (never add the same order twice), sum the money, and
 * keep the FIRST as the primary — the primary carries the customer that drives
 * attribution, so it must be stable across re-takes.
 *
 * Pure: no DB, no network, no clock.
 */

export type LinkedOrder = {
  id: string;
  name: string;
  total: number;
  customer_id?: string | null;
  customer_name?: string | null;
};

export type MergedOrders = {
  order_total: number; // sum across all linked orders
  count: number; // linked_orders.length
  primary: LinkedOrder | null; // the first — its customer drives the link
  linked_orders: LinkedOrder[]; // the full deduped set
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Combine already-linked orders with newly picked ones. Existing orders come
 * first so their order stays put (the primary never moves under a re-take), and
 * an id already present wins — re-picking the same order is a no-op, not a
 * double count.
 */
export function mergeLinkedOrders(
  existing: LinkedOrder[],
  picked: LinkedOrder[],
): MergedOrders {
  const merged: LinkedOrder[] = [];
  const seen = new Set<string>();
  for (const o of [...existing, ...picked]) {
    if (!o || seen.has(o.id)) continue;
    seen.add(o.id);
    merged.push(o);
  }
  const order_total = round2(
    merged.reduce((sum, o) => sum + (Number(o.total) || 0), 0),
  );
  return {
    order_total,
    count: merged.length,
    primary: merged[0] ?? null,
    linked_orders: merged,
  };
}
