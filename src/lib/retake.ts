/**
 * Re-taking a client: a customer the rep already attended today comes back and
 * buys. The purchase is added to the attendance she ALREADY logged, rather than
 * logged as a new one — otherwise the same person counts twice, inflating
 * attended and depressing conversion.
 *
 * Pure: no DB, no network, no clock.
 */

export type RetakeOrder = {
  id: string;
  name: string;
  total: number;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
};

export type ExistingEvent = {
  sold: boolean;
  order_total: number | string | null;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  shopify_customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

export type RetakePatch = {
  sold: true;
  order_total: number;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  shopify_customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The patch to apply to the existing attendance.
 *
 * `order_total` ADDS rather than replaces: a client who buys twice in a day
 * should show the combined value, and overwriting would silently drop the first
 * sale. Customer details fill in only where the event doesn't already have them,
 * so a re-take can never blank out contact captured on the first visit.
 */
export function retakePatch(
  existing: ExistingEvent,
  order: RetakeOrder | null,
): RetakePatch {
  const previous = Number(existing.order_total ?? 0) || 0;
  const added = order ? Number(order.total) || 0 : 0;

  return {
    sold: true,
    order_total: round2(previous + added),
    // The most recent linked order wins as THE order reference (there's one
    // column for it), but the money above keeps both.
    shopify_order_id: order?.id ?? existing.shopify_order_id,
    shopify_order_name: order?.name ?? existing.shopify_order_name,
    shopify_customer_id: order?.customer_id ?? existing.shopify_customer_id,
    customer_name: order?.customer_name ?? existing.customer_name,
    customer_email: order?.customer_email ?? existing.customer_email,
    customer_phone: order?.customer_phone ?? existing.customer_phone,
  };
}
