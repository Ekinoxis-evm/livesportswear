import { toCsv, type CsvCell } from "@/lib/csv";

/**
 * Pure math/formatting for physical inventory counts. An item is one barcode
 * (= one variant/size) within a count; `expected` is Shopify's stock at scan
 * or finalize time, null for barcodes the catalog doesn't know.
 */

export type CountItem = {
  barcode: string;
  sku: string | null;
  product_title: string;
  variant_title: string | null;
  qty: number;
  expected: number | null;
  unknown: boolean;
};

export type CountTotals = {
  scannedItems: number; // distinct barcodes with qty > 0
  countedUnits: number;
  expectedUnits: number; // over known items (expected != null, floored at 0 each)
  missingUnits: number; // expected-but-not-counted
  overUnits: number; // counted above expected
  unknownItems: number;
};

export function countTotals(items: CountItem[]): CountTotals {
  let countedUnits = 0;
  let expectedUnits = 0;
  let missingUnits = 0;
  let overUnits = 0;
  let scannedItems = 0;
  let unknownItems = 0;
  for (const it of items) {
    countedUnits += it.qty;
    if (it.qty > 0) scannedItems++;
    if (it.unknown) unknownItems++;
    if (it.expected != null) {
      // Negative Shopify stock means its records are already off — a physical
      // count can't be "missing" against a negative number.
      const expected = Math.max(it.expected, 0);
      expectedUnits += expected;
      const diff = it.qty - expected;
      if (diff < 0) missingUnits += -diff;
      else overUnits += diff;
    }
  }
  return { scannedItems, countedUnits, expectedUnits, missingUnits, overUnits, unknownItems };
}

export type VarianceRow = CountItem & { diff: number | null };

/** Report order: biggest shortages first, then overages, then matched, then unknown. */
export function varianceRows(items: CountItem[]): VarianceRow[] {
  const rows: VarianceRow[] = items.map((it) => ({
    ...it,
    diff: it.expected != null ? it.qty - Math.max(it.expected, 0) : null,
  }));
  const rank = (r: VarianceRow) => {
    if (r.unknown) return 3;
    if (r.diff != null && r.diff < 0) return 0;
    if (r.diff != null && r.diff > 0) return 1;
    return 2;
  };
  return rows.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0) ||
      a.product_title.localeCompare(b.product_title),
  );
}

export type BookRow = {
  barcode: string;
  sku: string | null;
  product_title: string;
  variant_title: string | null;
  qty: number;
  shopify_qty: number | null;
  unknown: boolean;
  counted_at: string;
};

/** The whole inventory book as CSV — our counted truth per barcode. */
export function buildBookCsv(locationName: string, rows: BookRow[]): string {
  const units = rows.reduce((a, r) => a + r.qty, 0);
  const body: CsvCell[][] = rows.map((r) => [
    r.product_title,
    r.variant_title ?? "",
    r.sku ?? "",
    r.barcode,
    r.qty,
    r.shopify_qty ?? "",
    r.counted_at.slice(0, 10),
    r.unknown ? "unknown barcode" : "",
  ]);
  return toCsv([
    [`Inventory book — ${locationName}`],
    [`${rows.length} items · ${units} units on hand`],
    [],
    ["Product", "Variant", "SKU", "Barcode", "On hand", "Shopify at count", "Counted", "Note"],
    ...body,
  ]);
}

export function buildInventoryCsv(
  header: { locationName: string; startedAt: string; status: string },
  items: CountItem[],
): string {
  const t = countTotals(items);
  const rows: CsvCell[][] = varianceRows(items).map((r) => [
    r.product_title,
    r.variant_title ?? "",
    r.sku ?? "",
    r.barcode,
    r.qty,
    r.expected ?? "",
    r.diff ?? "",
    r.unknown ? "unknown barcode" : "",
  ]);
  return toCsv([
    [`Inventory count — ${header.locationName}`],
    [`Started ${header.startedAt} · ${header.status}`],
    [
      `Counted ${t.countedUnits} units · expected ${t.expectedUnits} · missing ${t.missingUnits} · over ${t.overUnits}`,
    ],
    [],
    ["Product", "Variant", "SKU", "Barcode", "Counted", "Expected", "Diff", "Note"],
    ...rows,
  ]);
}
