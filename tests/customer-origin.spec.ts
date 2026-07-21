import { describe, expect, it } from "vitest";
import {
  accumulateOrigins,
  earliestByCustomer,
  unmappedStaffIds,
} from "@/lib/customer-origin";
import type { DayOrder } from "@/lib/shopify";

const order = (o: Partial<DayOrder> = {}): DayOrder => ({
  id: "1",
  name: "#1001",
  createdAt: "2026-07-20T15:00:00Z",
  net: 100,
  currency: "USD",
  sourceName: "pos",
  staffId: "77",
  customer: { id: "c1", createdAt: "2026-07-20T14:00:00Z" },
  ...o,
});

describe("earliestByCustomer", () => {
  it("attributes a customer to the staff on their earliest order", () => {
    const map = earliestByCustomer([
      order({ id: "2", createdAt: "2026-07-20T15:00:00Z", staffId: "99" }),
      order({ id: "1", createdAt: "2024-03-01T10:00:00Z", staffId: "77" }),
    ]);
    expect(map.get("c1")).toMatchObject({ orderId: "1", staffId: "77" });
  });

  it("keeps one entry per customer and separates different customers", () => {
    const map = earliestByCustomer([
      order({ customer: { id: "c1", createdAt: "2026-01-01T00:00:00Z" } }),
      order({ customer: { id: "c2", createdAt: "2026-01-01T00:00:00Z" } }),
      order({ customer: { id: "c1", createdAt: "2026-01-01T00:00:00Z" } }),
    ]);
    expect(map.size).toBe(2);
  });

  it("ignores draft orders — a draft must not claim a client", () => {
    const map = earliestByCustomer([
      order({ id: "draft", createdAt: "2024-01-01T00:00:00Z", sourceName: "shopify_draft_order" }),
      order({ id: "pos", createdAt: "2025-01-01T00:00:00Z", sourceName: "pos" }),
    ]);
    expect(map.get("c1")?.orderId).toBe("pos");
  });

  it("ignores online and unsourced orders", () => {
    const map = earliestByCustomer([
      order({ sourceName: "web" }),
      order({ sourceName: null }),
    ]);
    expect(map.size).toBe(0);
  });

  it("skips anonymous walk-ins with no customer on the order", () => {
    const map = earliestByCustomer([order({ customer: null })]);
    expect(map.size).toBe(0);
  });

  it("records a null staff id rather than dropping the customer", () => {
    const map = earliestByCustomer([order({ staffId: null })]);
    expect(map.get("c1")).toMatchObject({ staffId: null });
  });

  it("keeps the first seen on an exact timestamp tie", () => {
    const at = "2026-07-20T15:00:00Z";
    const map = earliestByCustomer([
      order({ id: "first", createdAt: at, staffId: "77" }),
      order({ id: "second", createdAt: at, staffId: "99" }),
    ]);
    expect(map.get("c1")?.orderId).toBe("first");
  });
});

describe("accumulateOrigins", () => {
  it("folds successive pages into one accumulator", () => {
    const acc = accumulateOrigins([
      order({ id: "late", createdAt: "2026-07-20T15:00:00Z" }),
    ]);
    accumulateOrigins([order({ id: "early", createdAt: "2024-02-02T09:00:00Z" })], acc);
    expect(acc.get("c1")?.orderId).toBe("early");
  });
});

describe("unmappedStaffIds", () => {
  it("lists staff with no matching employee, deduped and sorted", () => {
    const map = earliestByCustomer([
      order({ customer: { id: "c1", createdAt: "x" }, staffId: "77" }),
      order({ customer: { id: "c2", createdAt: "x" }, staffId: "99" }),
      order({ customer: { id: "c3", createdAt: "x" }, staffId: "88" }),
    ]);
    expect(unmappedStaffIds(map, new Set(["77"]))).toEqual(["88", "99"]);
  });

  it("returns nothing when every staff id maps", () => {
    const map = earliestByCustomer([order({ staffId: "77" })]);
    expect(unmappedStaffIds(map, new Set(["77"]))).toEqual([]);
  });
});
