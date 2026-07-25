import { describe, expect, it } from "vitest";
import { mergeLinkedOrders, type LinkedOrder } from "@/lib/linked-orders";

const o = (id: string, total: number, extra: Partial<LinkedOrder> = {}): LinkedOrder => ({
  id,
  name: `#${id}`,
  total,
  ...extra,
});

describe("mergeLinkedOrders", () => {
  it("sums the totals across several picked orders", () => {
    const m = mergeLinkedOrders([], [o("1", 120), o("2", 85)]);
    expect(m.order_total).toBe(205);
    expect(m.count).toBe(2);
  });

  it("keeps the first order as the primary", () => {
    const m = mergeLinkedOrders([], [o("1", 120), o("2", 85)]);
    expect(m.primary?.id).toBe("1");
  });

  it("dedupes by id — re-picking the same order never double-counts", () => {
    const m = mergeLinkedOrders([o("1", 120)], [o("1", 120), o("2", 85)]);
    expect(m.count).toBe(2);
    expect(m.order_total).toBe(205);
  });

  it("existing orders come first, so the primary is stable under a re-take", () => {
    const m = mergeLinkedOrders([o("1", 120)], [o("2", 85)]);
    expect(m.primary?.id).toBe("1");
    expect(m.linked_orders.map((x) => x.id)).toEqual(["1", "2"]);
  });

  it("rounds the sum to the cent rather than drifting", () => {
    const m = mergeLinkedOrders([], [o("1", 0.1), o("2", 0.2)]);
    expect(m.order_total).toBe(0.3);
  });

  it("is empty when nothing is linked", () => {
    const m = mergeLinkedOrders([], []);
    expect(m).toMatchObject({ order_total: 0, count: 0, primary: null, linked_orders: [] });
  });
});
