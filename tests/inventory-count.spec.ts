import { describe, expect, it } from "vitest";
import {
  buildBookCsv,
  buildInventoryCsv,
  countTotals,
  varianceRows,
  type CountItem,
} from "@/lib/inventory-count";

const item = (over: Partial<CountItem>): CountItem => ({
  barcode: "790",
  sku: "84939.S",
  product_title: "Jog Pants",
  product_type: "PANTS",
  variant_title: "S",
  qty: 0,
  expected: null,
  unknown: false,
  ...over,
});

describe("countTotals", () => {
  it("splits counted vs expected into missing and over units", () => {
    const t = countTotals([
      item({ barcode: "1", qty: 3, expected: 5 }), // 2 missing
      item({ barcode: "2", qty: 4, expected: 1 }), // 3 over
      item({ barcode: "3", qty: 0, expected: 2 }), // finalize-sweep row, 2 missing
      item({ barcode: "4", qty: 1, unknown: true }), // unknown barcode
    ]);
    expect(t).toEqual({
      scannedItems: 3,
      countedUnits: 8,
      expectedUnits: 8,
      missingUnits: 4,
      overUnits: 3,
      unknownItems: 1,
    });
  });

  it("floors negative Shopify stock at zero — a count can't be missing against -1", () => {
    const t = countTotals([item({ qty: 1, expected: -1 })]);
    expect(t.expectedUnits).toBe(0);
    expect(t.overUnits).toBe(1);
    expect(t.missingUnits).toBe(0);
  });
});

describe("varianceRows", () => {
  it("orders shortages first, then overages, then matched, then unknown", () => {
    const rows = varianceRows([
      item({ barcode: "match", qty: 2, expected: 2 }),
      item({ barcode: "unknown", qty: 1, unknown: true }),
      item({ barcode: "over", qty: 5, expected: 1 }),
      item({ barcode: "short", qty: 0, expected: 6 }),
    ]);
    expect(rows.map((r) => r.barcode)).toEqual(["short", "over", "match", "unknown"]);
    expect(rows[0].diff).toBe(-6);
    expect(rows[3].diff).toBeNull();
  });
});

describe("buildBookCsv", () => {
  it("renders unit totals and one row per barcode", () => {
    const csv = buildBookCsv("Miami Lincoln Road", [
      {
        barcode: "790",
        sku: "84939.S",
        product_title: "Jog Pants",
        product_type: "PANTS",
        variant_title: "S",
        qty: 4,
        shopify_qty: 3,
        unknown: false,
        counted_at: "2026-07-17T22:00:00Z",
      },
    ]);
    expect(csv).toContain("Inventory book — Miami Lincoln Road");
    expect(csv).toContain("1 items · 4 units on hand");
    expect(csv).toContain("Jog Pants,PANTS,S,84939.S,790,4,3,2026-07-17,");
  });
});

describe("buildInventoryCsv", () => {
  it("renders header totals and one row per item", () => {
    const csv = buildInventoryCsv(
      { locationName: "Miami Lincoln Road", startedAt: "2026-07-17 10:00", status: "final" },
      [item({ qty: 2, expected: 3 })],
    );
    expect(csv).toContain("Inventory count — Miami Lincoln Road");
    expect(csv).toContain("Counted 2 units · in Shopify 3 · missing 1 · over 0");
    expect(csv).toContain("Jog Pants,PANTS,S,84939.S,790,2,3,-1,");
  });
});
