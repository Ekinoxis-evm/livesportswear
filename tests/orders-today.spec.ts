import { describe, expect, it } from "vitest";
import { channelOf, buildOrdersView } from "@/lib/orders-today";
import type { DayOrder } from "@/lib/shopify";

const order = (o: Partial<DayOrder> = {}): DayOrder => ({
  id: "1",
  name: "#1001",
  createdAt: "2026-07-20T15:00:00Z",
  net: 100,
  currency: "USD",
  sourceName: "pos",
  staffId: "77",
  ...o,
});

describe("channelOf", () => {
  it("a staff-attributed order is in-store regardless of source_name", () => {
    expect(channelOf({ staffId: "77", sourceName: "web" })).toBe("pos");
    expect(channelOf({ staffId: "77", sourceName: null })).toBe("pos");
  });
  it("no staff → online, unless source_name says pos (login-less POS sale)", () => {
    expect(channelOf({ staffId: null, sourceName: "web" })).toBe("online");
    expect(channelOf({ staffId: null, sourceName: "checkout_one_page" })).toBe("online");
    expect(channelOf({ staffId: null, sourceName: null })).toBe("online");
    expect(channelOf({ staffId: null, sourceName: "pos" })).toBe("pos");
    expect(channelOf({ staffId: null, sourceName: "Shopify POS" })).toBe("pos");
  });
});

describe("buildOrdersView — channel totals", () => {
  it("splits orders and net by channel and sums the combined total", () => {
    const { channelTotals } = buildOrdersView(
      [
        order({ id: "1", sourceName: "pos", net: 100 }),
        order({ id: "2", sourceName: "pos", net: 50 }),
        order({ id: "3", sourceName: "web", net: 30, staffId: null }),
      ],
      new Map(),
    );
    expect(channelTotals.pos).toEqual({ orders: 2, net: 150 });
    expect(channelTotals.online).toEqual({ orders: 1, net: 30 });
    expect(channelTotals.all).toEqual({ orders: 3, net: 180 });
  });
});

describe("buildOrdersView — per person", () => {
  it("gives each staff their combined total, orders, and average ticket", () => {
    const { perPerson } = buildOrdersView(
      [
        order({ id: "1", staffId: "77", net: 100 }),
        order({ id: "2", staffId: "77", net: 40 }),
        order({ id: "3", staffId: "88", net: 90 }),
      ],
      new Map([
        ["77", "Ana"],
        ["88", "Beto"],
      ]),
    );
    expect(perPerson).toEqual([
      { staffId: "77", name: "Ana", orders: 2, net: 140, avgTicket: 70 },
      { staffId: "88", name: "Beto", orders: 1, net: 90, avgTicket: 90 },
    ]);
  });

  it("excludes online orders (no staff) from the per-person table", () => {
    const { perPerson } = buildOrdersView(
      [order({ id: "1", sourceName: "web", staffId: null, net: 200 })],
      new Map(),
    );
    expect(perPerson).toEqual([]);
  });

  it("falls back to 'Staff #id' for unmapped POS staff", () => {
    const { perPerson } = buildOrdersView([order({ staffId: "999", net: 25 })], new Map());
    expect(perPerson[0]).toMatchObject({ name: "Staff #999", orders: 1, avgTicket: 25 });
  });
});

describe("buildOrdersView — rows", () => {
  it("tags each row's channel + seller and sorts newest first", () => {
    const { rows } = buildOrdersView(
      [
        order({ id: "old", createdAt: "2026-07-20T09:00:00Z", staffId: "77" }),
        order({ id: "new", createdAt: "2026-07-20T18:00:00Z", sourceName: "web", staffId: null }),
      ],
      new Map([["77", "Ana"]]),
    );
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
    expect(rows[0]).toMatchObject({ channel: "online", sellerName: null });
    expect(rows[1]).toMatchObject({ channel: "pos", sellerName: "Ana" });
  });
});
