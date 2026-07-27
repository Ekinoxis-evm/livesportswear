import type { DayOrder } from "@/lib/shopify";

/**
 * Pure shaping for the kiosk "today's orders" view. No DB, no network, no time.
 *
 * This Shopify store is the in-store/POS shop (online sales live on a separate
 * store), so we count only real POS orders — `source_name === "pos"` — and drop
 * everything else (notably `shopify_draft_order`, which are manual/zero-value and
 * would otherwise inflate order counts and skew a rep's average ticket). Each POS
 * order carries the seller's `user_id` (staffId), so per-person attribution is
 * exact.
 */

/** A real in-store POS sale (excludes drafts and anything non-pos). */
export const isPosOrder = (o: DayOrder) => o.sourceName === "pos";

export type OrderRow = DayOrder & { sellerName: string | null };

export type PersonRow = {
  staffId: string;
  name: string;
  orders: number;
  gross: number; // full-price value (the headline sales figure)
  net: number;
  avgTicket: number; // gross / orders
};

export type OrdersView = {
  rows: OrderRow[]; // POS orders, newest first
  total: { orders: number; gross: number; net: number };
  perPerson: PersonRow[]; // gross desc
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildOrdersView(
  orders: DayOrder[],
  staffToName: Map<string, string>,
): OrdersView {
  const pos = orders.filter(isPosOrder);
  const byStaff = new Map<string, { gross: number; net: number; orders: number }>();
  let gross = 0;
  let net = 0;

  const rows: OrderRow[] = pos.map((o) => {
    gross += o.gross;
    net += o.net;
    let sellerName: string | null = null;
    if (o.staffId) {
      sellerName = staffToName.get(o.staffId) ?? `Staff #${o.staffId}`;
      const acc = byStaff.get(o.staffId) ?? { gross: 0, net: 0, orders: 0 };
      acc.gross += o.gross;
      acc.net += o.net;
      acc.orders += 1;
      byStaff.set(o.staffId, acc);
    }
    return { ...o, sellerName };
  });

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const perPerson: PersonRow[] = [...byStaff.entries()]
    .map(([staffId, v]) => ({
      staffId,
      name: staffToName.get(staffId) ?? `Staff #${staffId}`,
      orders: v.orders,
      gross: round2(v.gross),
      net: round2(v.net),
      avgTicket: v.orders ? round2(v.gross / v.orders) : 0,
    }))
    .sort((a, b) => b.gross - a.gross || a.name.localeCompare(b.name));

  return {
    rows,
    total: { orders: pos.length, gross: round2(gross), net: round2(net) },
    perPerson,
  };
}
