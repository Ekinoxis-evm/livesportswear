import { describe, expect, it } from "vitest";
import { isPosOrder, buildOrdersView } from "@/lib/orders-today";
import type { DayOrder } from "@/lib/shopify";

const order = (o: Partial<DayOrder> = {}): DayOrder => ({
  id: "1",
  name: "#1001",
  createdAt: "2026-07-20T15:00:00Z",
  net: 100,
  gross: 120,
  currency: "USD",
  sourceName: "pos",
  staffId: "77",
  customer: null,
  ...o,
});

describe("isPosOrder", () => {
  it("keeps only real POS orders", () => {
    expect(isPosOrder(order({ sourceName: "pos" }))).toBe(true);
    expect(isPosOrder(order({ sourceName: "shopify_draft_order" }))).toBe(false);
    expect(isPosOrder(order({ sourceName: "web" }))).toBe(false);
    expect(isPosOrder(order({ sourceName: null }))).toBe(false);
  });
});

describe("buildOrdersView", () => {
  it("totals only POS orders — drafts are excluded from count, gross and net", () => {
    const { total } = buildOrdersView(
      [
        order({ id: "1", sourceName: "pos", gross: 120, net: 100 }),
        order({ id: "2", sourceName: "pos", gross: 60, net: 50 }),
        order({ id: "3", sourceName: "shopify_draft_order", gross: 0, net: 0, staffId: "88" }),
      ],
      new Map(),
    );
    expect(total).toEqual({ orders: 2, gross: 180, net: 150 });
  });

  it("gives each seller gross · net · orders · avg ticket (gross/orders, POS only)", () => {
    const { perPerson } = buildOrdersView(
      [
        order({ id: "1", staffId: "77", gross: 120, net: 100 }),
        order({ id: "2", staffId: "77", gross: 60, net: 40 }),
        order({ id: "3", staffId: "88", gross: 100, net: 90 }),
        order({ id: "4", staffId: "88", sourceName: "shopify_draft_order", gross: 0, net: 0 }), // ignored
      ],
      new Map([
        ["77", "Ana"],
        ["88", "Beto"],
      ]),
    );
    expect(perPerson).toEqual([
      { staffId: "77", name: "Ana", orders: 2, gross: 180, net: 140, avgTicket: 90 },
      { staffId: "88", name: "Beto", orders: 1, gross: 100, net: 90, avgTicket: 100 },
    ]);
  });

  it("falls back to 'Staff #id' for unmapped sellers and sorts newest first", () => {
    const { rows } = buildOrdersView(
      [
        order({ id: "old", createdAt: "2026-07-20T09:00:00Z", staffId: "999" }),
        order({ id: "new", createdAt: "2026-07-20T18:00:00Z", staffId: "77" }),
      ],
      new Map([["77", "Ana"]]),
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(rows[1].sellerName).toBe("Staff #999");
  });
});
