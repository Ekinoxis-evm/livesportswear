import { describe, expect, it } from "vitest";
import {
  monthRows,
  periodBounds,
  resolveSalesPeriod,
  staffRowsFromEntries,
} from "@/lib/sales-period";
import type { SalesBreakdown } from "@/lib/sales-breakdown";

const b = (net: number): SalesBreakdown => ({
  gross: net,
  discounts: 0,
  returns: 0,
  net,
});

describe("resolveSalesPeriod", () => {
  it("defaults to the first allowed period", () => {
    expect(resolveSalesPeriod({}, "2026-07-19").mode).toBe("today");
    expect(resolveSalesPeriod({}, "2026-07-19", ["week", "today"]).mode).toBe("week");
  });

  it("activates custom when dates are present, even without the pill", () => {
    expect(resolveSalesPeriod({ from: "2026-07-01" }, "2026-07-19").mode).toBe("custom");
  });

  it("activates custom from the pill alone, with month-to-date defaults", () => {
    const r = resolveSalesPeriod({ period: "custom" }, "2026-07-19");
    expect(r.mode).toBe("custom");
    expect(r.from).toBe("2026-07-01");
    expect(r.to).toBe("2026-07-19");
  });

  it("falls back when the requested period isn't allowed", () => {
    expect(
      resolveSalesPeriod({ period: "month" }, "2026-07-19", ["week", "today"]).mode,
    ).toBe("week");
  });
});

describe("periodBounds", () => {
  const args = { today: "2026-07-19", from: "2026-07-02", to: "2026-07-05" };
  it("covers today, the running week, and the running month", () => {
    expect(periodBounds("today", args)).toEqual({ from: "2026-07-19", to: "2026-07-19" });
    // 2026-07-19 is a Sunday — the week runs from Monday the 13th.
    expect(periodBounds("week", args)).toEqual({ from: "2026-07-13", to: "2026-07-19" });
    expect(periodBounds("month", args)).toEqual({ from: "2026-07-01", to: "2026-07-19" });
  });
  it("passes custom dates through", () => {
    expect(periodBounds("custom", args)).toEqual({ from: "2026-07-02", to: "2026-07-05" });
  });
});

describe("staffRowsFromEntries", () => {
  it("keeps every mapped employee ($0 included) and sorts by net desc", () => {
    const rows = staffRowsFromEntries(
      [["111", b(200)]],
      [
        { name: "Quiet", shopify_staff_id: "222" },
        { name: "Star", shopify_staff_id: "111" },
        { name: "Unmapped", shopify_staff_id: null },
      ],
    );
    expect(rows.map((r) => [r.name, r.net])).toEqual([
      ["Star", 200],
      ["Quiet", 0],
    ]);
  });
});

describe("monthRows", () => {
  it("shapes breakdowns, nulls pre-decomposition months, and computes goal pct", () => {
    const rows = monthRows(
      [
        { employee_id: "a", amount: 500, gross_amount: 600, discounts_amount: 100 },
        { employee_id: "b", amount: 300, gross_amount: null },
      ],
      [
        { id: "a", name: "Ana" },
        { id: "b", name: "Bea" },
        { id: "c", name: "Cero" },
      ],
      { goals: new Map([["a", 1000]]) },
    );
    expect(rows.map((r) => r.name)).toEqual(["Ana", "Bea"]); // Cero filtered
    expect(rows[0].breakdown).toEqual({ gross: 600, discounts: 100, returns: 0, net: 500 });
    expect(rows[0].goalPct).toBe(0.5);
    expect(rows[1].breakdown).toBeNull();
  });

  it("keeps zero rows when asked", () => {
    const rows = monthRows([], [{ id: "c", name: "Cero" }], { keepZeros: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].net).toBe(0);
  });
});
