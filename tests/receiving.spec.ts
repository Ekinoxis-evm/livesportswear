import { describe, expect, it } from "vitest";
import {
  mapCsvRows,
  receivingRows,
  receivingTotals,
  buildReceivingWrites,
  type ReceivingItem,
  type FreshOnHand,
} from "@/lib/receiving";

const item = (overrides: Partial<ReceivingItem> = {}): ReceivingItem => ({
  barcode: "790",
  sku: "84939.S",
  product_title: "Jog Pants",
  variant_title: "S",
  expected: 4,
  doc_qty: 6,
  qty: 6,
  unknown: false,
  ...overrides,
});

describe("mapCsvRows", () => {
  it("maps barcode + qty columns by header synonyms", () => {
    const rows = [{ UPC: "12345", "Qty Shipped": "10", Product: "Sepia Bra" }];
    expect(mapCsvRows(rows)).toEqual([
      { code: "12345", codeType: "barcode", description: "Sepia Bra", qty: 10 },
    ]);
  });

  it("falls back to SKU when there is no barcode column", () => {
    const rows = [{ Style: "LV-LEG-S", Quantity: "8" }];
    expect(mapCsvRows(rows)[0]).toMatchObject({ code: "LV-LEG-S", codeType: "sku", qty: 8 });
  });

  it("skips rows with no code or a non-positive quantity", () => {
    const rows = [
      { barcode: "1", qty: "0" }, // zero qty
      { barcode: "", qty: "5" }, // no code
      { barcode: "2", qty: "3" }, // kept
    ];
    expect(mapCsvRows(rows)).toHaveLength(1);
    expect(mapCsvRows(rows)[0].code).toBe("2");
  });

  it("returns nothing for an empty sheet", () => {
    expect(mapCsvRows([])).toEqual([]);
  });
});

describe("receivingRows", () => {
  it("new total is current on-hand plus arrived", () => {
    const [row] = receivingRows([item({ expected: 4, qty: 6 })]);
    expect(row.newTotal).toBe(10);
  });

  it("treats a null on-hand as zero", () => {
    const [row] = receivingRows([item({ expected: null, qty: 6 })]);
    expect(row.newTotal).toBe(6);
  });

  it("flags a short shipment (arrived < document)", () => {
    const [row] = receivingRows([item({ doc_qty: 6, qty: 4 })]);
    expect(row.status).toBe("short");
    expect(row.docDiff).toBe(-2);
  });

  it("flags an over shipment (arrived > document)", () => {
    const [row] = receivingRows([item({ doc_qty: 6, qty: 8 })]);
    expect(row.status).toBe("over");
  });

  it("sorts unmatched and discrepancies ahead of clean matches", () => {
    const rows = receivingRows([
      item({ barcode: "ok", doc_qty: 5, qty: 5 }),
      item({ barcode: "gone", unknown: true, doc_qty: null, expected: null }),
      item({ barcode: "short", doc_qty: 5, qty: 2 }),
    ]);
    expect(rows.map((r) => r.barcode)).toEqual(["gone", "short", "ok"]);
  });
});

describe("receivingTotals", () => {
  it("counts matched, unmatched, arrived units and discrepancies", () => {
    const totals = receivingTotals([
      item({ barcode: "a", doc_qty: 5, qty: 5 }),
      item({ barcode: "b", doc_qty: 5, qty: 3 }),
      item({ barcode: "c", unknown: true, qty: 2, doc_qty: null }),
    ]);
    expect(totals).toEqual({ lines: 3, matched: 2, unmatched: 1, unitsArrived: 10, discrepancies: 1 });
  });
});

describe("buildReceivingWrites", () => {
  const fresh = (onHand: number | null): FreshOnHand => ({ inventoryItemId: "gid://x", onHand });

  it("adds arrived to the fresh on-hand, not the stale snapshot", () => {
    const writes = buildReceivingWrites(
      [item({ barcode: "790", expected: 4, qty: 6 })],
      new Map([["790", fresh(10)]]), // stock moved since match
    );
    expect(writes).toEqual([{ inventoryItemId: "gid://x", quantity: 16, barcode: "790" }]);
  });

  it("skips unknown, zero-arrived, and unresolved rows", () => {
    const writes = buildReceivingWrites(
      [
        item({ barcode: "u", unknown: true, qty: 5 }),
        item({ barcode: "z", qty: 0 }),
        item({ barcode: "missing", qty: 3 }),
      ],
      new Map([["790", fresh(1)]]),
    );
    expect(writes).toEqual([]);
  });
});
