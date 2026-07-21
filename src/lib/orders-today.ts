import type { DayOrder } from "@/lib/shopify";

/**
 * Pure shaping for the kiosk "today's orders" view. No DB, no network, no time.
 *
 * Two independent lenses on the same day of orders:
 *  - channelTotals: the store-level split — how many/what value were in-store POS
 *    vs online (Shopify delivery). Online counts toward the totals.
 *  - perPerson: each salesperson's OWN total (orders · net · avg ticket), NOT
 *    split by channel. Only POS orders carry a staff id, so online orders never
 *    enter this — they live only in channelTotals.
 */

export type Channel = "pos" | "online";

/**
 * In-store POS vs online. With individual Shopify POS logins every in-store
 * order carries a staff `user_id` and online web orders don't — the same signal
 * `fetchStaffSales` attributes on — so `staffId` is the reliable split. We also
 * treat any `source_name` containing "pos" as in-store to cover a POS sale rung
 * without a login. (`source_name === "pos"` alone was too brittle — a store
 * whose POS reports a different source string read every order as "online".)
 */
export function channelOf(order: { staffId: string | null; sourceName: string | null }): Channel {
  if (order.staffId) return "pos";
  if (order.sourceName && order.sourceName.toLowerCase().includes("pos")) return "pos";
  return "online";
}

export type OrderRow = DayOrder & {
  channel: Channel;
  sellerName: string | null; // POS staff name; null for online (or unmapped handled in perPerson)
};

export type ChannelCount = { orders: number; net: number };
export type ChannelTotals = { pos: ChannelCount; online: ChannelCount; all: ChannelCount };

export type PersonRow = {
  staffId: string;
  name: string;
  orders: number;
  net: number;
  avgTicket: number;
};

export type OrdersView = {
  rows: OrderRow[]; // newest first
  channelTotals: ChannelTotals;
  perPerson: PersonRow[]; // POS-attributed, net desc
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildOrdersView(
  orders: DayOrder[],
  staffToName: Map<string, string>,
): OrdersView {
  const pos: ChannelCount = { orders: 0, net: 0 };
  const online: ChannelCount = { orders: 0, net: 0 };
  const byStaff = new Map<string, { net: number; orders: number }>();

  const rows: OrderRow[] = orders.map((o) => {
    const channel = channelOf(o);
    const bucket = channel === "pos" ? pos : online;
    bucket.orders += 1;
    bucket.net += o.net;

    // Per-person attribution gates on staffId ALONE — the same rule the Sales
    // ranking (fetchStaffSales) uses — so the two "who sold what" views on the
    // page can never disagree. Any staff-attributed order counts here.
    let sellerName: string | null = null;
    if (o.staffId) {
      sellerName = staffToName.get(o.staffId) ?? `Staff #${o.staffId}`;
      const acc = byStaff.get(o.staffId) ?? { net: 0, orders: 0 };
      acc.net += o.net;
      acc.orders += 1;
      byStaff.set(o.staffId, acc);
    }
    return { ...o, channel, sellerName };
  });

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const perPerson: PersonRow[] = [...byStaff.entries()]
    .map(([staffId, v]) => ({
      staffId,
      name: staffToName.get(staffId) ?? `Staff #${staffId}`,
      orders: v.orders,
      net: round2(v.net),
      avgTicket: v.orders ? round2(v.net / v.orders) : 0,
    }))
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));

  const channelTotals: ChannelTotals = {
    pos: { orders: pos.orders, net: round2(pos.net) },
    online: { orders: online.orders, net: round2(online.net) },
    all: { orders: pos.orders + online.orders, net: round2(pos.net + online.net) },
  };

  return { rows, channelTotals, perPerson };
}
