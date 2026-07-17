import { toCsv, type CsvCell } from "@/lib/csv";

/**
 * Pure math for the staged Shopify push: diff the store's inventory book
 * against Shopify's CURRENT on-hand per variant, producing the correction
 * list an admin reviews before anything is written. No DB, no time.
 */

export type PushBookRow = {
  barcode: string;
  sku: string | null;
  product_title: string;
  variant_title: string | null;
  qty: number;
  unknown: boolean;
};

export type PushVariantInput = {
  barcode: string;
  sku: string | null;
  productTitle: string;
  variantTitle: string | null;
  inventoryItemId: string;
  tracked: boolean;
  onHand: number | null; // at the store's Shopify location; null = no level there yet
};

export type PushCorrection = {
  barcode: string;
  sku: string | null;
  product_title: string;
  variant_title: string | null;
  inventory_item_id: string;
  book_qty: number;
  shopify_qty: number;
  delta: number; // book_qty - shopify_qty, never 0
};

export type PushPlan = {
  corrections: PushCorrection[]; // sorted |delta| desc, then title
  inSync: number;
  skippedUnknown: string[]; // barcodes flagged unknown in the book
  skippedNoVariant: string[]; // no live variant, untracked, or ambiguous barcode
  notInBook: number; // catalog variants the book doesn't mention (left untouched)
};

export function buildPushPlan(
  bookRows: PushBookRow[],
  variants: PushVariantInput[],
): PushPlan {
  const byBarcode = new Map<string, PushVariantInput | "ambiguous">();
  for (const v of variants) {
    byBarcode.set(v.barcode, byBarcode.has(v.barcode) ? "ambiguous" : v);
  }

  const corrections: PushCorrection[] = [];
  const skippedUnknown: string[] = [];
  const skippedNoVariant: string[] = [];
  let inSync = 0;
  const inBook = new Set<string>();

  for (const row of bookRows) {
    inBook.add(row.barcode);
    if (row.unknown) {
      skippedUnknown.push(row.barcode);
      continue;
    }
    const variant = byBarcode.get(row.barcode);
    // A barcode on two variants is an ambiguous write target — never guess.
    if (!variant || variant === "ambiguous" || !variant.tracked) {
      skippedNoVariant.push(row.barcode);
      continue;
    }
    // No inventory level at the location yet still means 0 on hand — writing
    // establishes the level.
    const shopifyQty = variant.onHand ?? 0;
    const delta = row.qty - shopifyQty;
    if (delta === 0) {
      inSync++;
      continue;
    }
    corrections.push({
      barcode: row.barcode,
      sku: row.sku,
      product_title: row.product_title,
      variant_title: row.variant_title,
      inventory_item_id: variant.inventoryItemId,
      book_qty: row.qty,
      shopify_qty: shopifyQty,
      delta,
    });
  }

  corrections.sort(
    (a, b) =>
      Math.abs(b.delta) - Math.abs(a.delta) ||
      a.product_title.localeCompare(b.product_title),
  );

  const notInBook = variants.filter((v) => !inBook.has(v.barcode)).length;
  return { corrections, inSync, skippedUnknown, skippedNoVariant, notInBook };
}

export type PushTotals = {
  rows: number;
  unitsUp: number;
  unitsDown: number;
};

export function pushTotals(
  items: { delta: number; excluded: boolean }[],
): PushTotals {
  let rows = 0;
  let unitsUp = 0;
  let unitsDown = 0;
  for (const it of items) {
    if (it.excluded) continue;
    rows++;
    if (it.delta > 0) unitsUp += it.delta;
    else unitsDown += -it.delta;
  }
  return { rows, unitsUp, unitsDown };
}

export type PushCsvRow = PushCorrection & { excluded: boolean };

/** The draft as CSV for offline review — excluded rows included but marked. */
export function buildPushCsv(locationName: string, rows: PushCsvRow[]): string {
  const t = pushTotals(rows);
  const body: CsvCell[][] = rows.map((r) => [
    r.product_title,
    r.variant_title ?? "",
    r.sku ?? "",
    r.barcode,
    r.book_qty,
    r.shopify_qty,
    r.delta,
    r.excluded ? "excluded" : "",
  ]);
  return toCsv([
    [`Shopify push draft — ${locationName}`],
    [`${t.rows} rows to write · ${t.unitsUp} units up · ${t.unitsDown} units down`],
    [],
    ["Product", "Variant", "SKU", "Barcode", "Book qty", "Shopify on hand", "Delta", "Note"],
    ...body,
  ]);
}
