import { z } from "zod";

/**
 * Pure math for the "New Stock" (receiving) inventory mode: turn a parsed
 * supplier document into line items, and turn verified arrivals into the
 * ADDITIVE Shopify write (new on-hand = current + arrived). No DB, no network,
 * no time — the AI/CSV/Shopify I/O lives in src/server/receiving.ts.
 */

/** One line as extracted from a document (before it's matched to Shopify). */
export const extractedLineSchema = z.object({
  code: z.string().trim().max(60).describe("The barcode/UPC or SKU printed on the line"),
  codeType: z.enum(["barcode", "sku", "unknown"]),
  description: z.string().trim().max(300).default(""),
  qty: z.number().int().min(0).max(1_000_000).describe("Units on this line"),
});
export type ExtractedLine = z.infer<typeof extractedLineSchema>;

const BARCODE_KEYS = ["barcode", "upc", "ean", "gtin", "codigo de barras"];
const SKU_KEYS = ["sku", "style", "style code", "style number", "item", "item code", "reference", "ref", "model", "referencia"];
const QTY_KEYS = ["qty", "quantity", "qty shipped", "quantity shipped", "units", "count", "cantidad"];
const DESC_KEYS = ["description", "product", "name", "title", "item description", "producto", "descripcion"];
const COLOR_KEYS = ["color", "colour", "cor", "colored"];
// Size headers become the middle segment of the SKU verbatim (SKU is
// reference.SIZE.color, e.g. 46586.M.00RX80 / P1153.2XL.00RX89). Kept as an
// ordered set so a header is matched case-insensitively but reproduced exactly.
const SIZE_HEADERS = [
  "xs", "s", "m", "l", "xl", "2xl", "3xl", "xxl", "xxxl",
  "u", "un", "unico", "único", "os", "one size",
];

const norm = (s: string) => s.trim().toLowerCase();

/** Find the first row key whose normalized name matches one of `names`. */
function pickColumn(keys: string[], names: string[]): string | null {
  for (const name of names) {
    const hit = keys.find((k) => norm(k) === name);
    if (hit) return hit;
  }
  // looser contains-match as a fallback (e.g. "Qty Shipped (units)")
  for (const name of names) {
    const hit = keys.find((k) => norm(k).includes(name));
    if (hit) return hit;
  }
  return null;
}

function toInt(v: unknown): number {
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/** Size columns present in the header, mapped to the exact header text. */
function sizeColumns(keys: string[]): { key: string; size: string }[] {
  return keys
    .filter((k) => SIZE_HEADERS.includes(norm(k)))
    .map((k) => ({ key: k, size: k.trim() }));
}

/**
 * The supplier invoice arrives as a size MATRIX: one row per garment
 * (Reference + Color + Description) with a quantity under each size column
 * (XS/S/M/L/XL…). Shopify variants are per-size, keyed by SKU
 * `reference.SIZE.color` (verified live: 46586.M.00RX80, P1153.2XL.00RX89), so
 * each filled cell explodes into its own line with that assembled SKU.
 *
 * Used only when the sheet looks like a matrix — a Reference column, a Color
 * column, and at least two size columns. Otherwise `mapCsvRows` handles the
 * flat barcode/SKU/qty shape.
 */
export function mapInvoiceMatrix(rows: Record<string, unknown>[]): ExtractedLine[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  const refCol = pickColumn(keys, SKU_KEYS);
  const colorCol = pickColumn(keys, COLOR_KEYS);
  const descCol = pickColumn(keys, DESC_KEYS);
  const sizes = sizeColumns(keys);
  if (!refCol || !colorCol || sizes.length < 2) return [];

  const lines: ExtractedLine[] = [];
  for (const row of rows) {
    const reference = String(row[refCol] ?? "").trim();
    const color = String(row[colorCol] ?? "").trim();
    const description = descCol ? String(row[descCol] ?? "").trim() : "";
    if (!reference || !color) continue; // header/total/blank rows

    for (const { key, size } of sizes) {
      const qty = toInt(row[key]);
      if (qty <= 0) continue;
      lines.push({
        code: `${reference}.${size}.${color}`,
        codeType: "sku",
        description: description ? `${description} · ${size}` : `${reference} · ${size}`,
        qty,
      });
    }
  }
  return lines;
}

/** A row is usable as a header when it names a code column plus quantities. */
function isHeaderRow(cells: string[]): boolean {
  const keys = cells.map((c) => c.trim()).filter(Boolean);
  if (keys.length === 0) return false;
  const hasCode =
    pickColumn(keys, BARCODE_KEYS) !== null || pickColumn(keys, SKU_KEYS) !== null;
  const hasQty =
    pickColumn(keys, QTY_KEYS) !== null || sizeColumns(keys).length >= 2;
  return hasCode && hasQty;
}

/**
 * Turn a spreadsheet grid (rows of cells, from an .xlsx sheet) into the
 * header-keyed rows the mappers expect. The header often isn't the first row —
 * supplier invoices carry a title/address block above it — so this finds the
 * first row that reads as a header and keys everything below it. Blank trailing
 * columns are dropped; duplicate headers keep the first.
 */
export function gridToRows(grid: unknown[][]): Record<string, unknown>[] {
  const asText = (v: unknown) => (v == null ? "" : String(v));
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    if (isHeaderRow((grid[i] ?? []).map(asText))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const headers = (grid[headerIdx] ?? []).map(asText);
  const rows: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const cells = grid[i] ?? [];
    const row: Record<string, unknown> = {};
    let any = false;
    headers.forEach((h, c) => {
      const key = h.trim();
      if (!key || key in row) return;
      row[key] = cells[c] ?? "";
      if (asText(cells[c]).trim()) any = true;
    });
    if (any) rows.push(row);
  }
  return rows;
}

/** True when the sheet is a size matrix rather than a flat qty list. */
export function looksLikeMatrix(rows: Record<string, unknown>[]): boolean {
  if (rows.length === 0) return false;
  const keys = Object.keys(rows[0]);
  return (
    pickColumn(keys, SKU_KEYS) !== null &&
    pickColumn(keys, COLOR_KEYS) !== null &&
    sizeColumns(keys).length >= 2 &&
    pickColumn(keys, QTY_KEYS) === null // a single-qty column means it's flat
  );
}

/**
 * Map header-keyed CSV rows (papaparse `header:true` output) to extracted lines.
 * A size-matrix invoice explodes per size (`mapInvoiceMatrix`); otherwise the
 * flat barcode / SKU / qty shape is detected by header synonyms, skipping rows
 * with neither a code nor a positive quantity.
 */
export function mapCsvRows(rows: Record<string, unknown>[]): ExtractedLine[] {
  if (rows.length === 0) return [];
  if (looksLikeMatrix(rows)) return mapInvoiceMatrix(rows);

  const keys = Object.keys(rows[0]);
  const barcodeCol = pickColumn(keys, BARCODE_KEYS);
  const skuCol = pickColumn(keys, SKU_KEYS);
  const qtyCol = pickColumn(keys, QTY_KEYS);
  const descCol = pickColumn(keys, DESC_KEYS);

  const lines: ExtractedLine[] = [];
  for (const row of rows) {
    const barcode = barcodeCol ? String(row[barcodeCol] ?? "").trim() : "";
    const sku = skuCol ? String(row[skuCol] ?? "").trim() : "";
    const qty = qtyCol ? toInt(row[qtyCol]) : 0;
    const description = descCol ? String(row[descCol] ?? "").trim() : "";

    const code = barcode || sku;
    if (!code || qty <= 0) continue; // empty / total rows
    lines.push({
      code,
      codeType: barcode ? "barcode" : "sku",
      description,
      qty,
    });
  }
  return lines;
}

/** A receiving count item, once matched (or flagged) against Shopify. */
export type ReceivingItem = {
  barcode: string;
  sku: string | null;
  product_title: string;
  variant_title: string | null;
  expected: number | null; // current Shopify on-hand snapshot at match time
  doc_qty: number | null; // what the document said arrived
  qty: number; // physically verified arrived
  unknown: boolean; // not matched to a Shopify variant
};

export type ReceivingStatus = "matched" | "short" | "over" | "unmatched";

export type ReceivingRow = ReceivingItem & {
  newTotal: number; // (expected ?? 0) + qty
  docDiff: number; // qty - doc_qty (0 when no doc_qty)
  status: ReceivingStatus;
};

function statusOf(item: ReceivingItem, docDiff: number): ReceivingStatus {
  if (item.unknown) return "unmatched";
  if (item.doc_qty == null) return "matched";
  if (docDiff < 0) return "short";
  if (docDiff > 0) return "over";
  return "matched";
}

const RANK: Record<ReceivingStatus, number> = { unmatched: 0, short: 1, over: 2, matched: 3 };

/** Preview rows for the review table: current · arrived · new total, discrepancies first. */
export function receivingRows(items: ReceivingItem[]): ReceivingRow[] {
  return items
    .map((item) => {
      const docDiff = item.doc_qty == null ? 0 : item.qty - item.doc_qty;
      return {
        ...item,
        newTotal: (item.expected ?? 0) + item.qty,
        docDiff,
        status: statusOf(item, docDiff),
      };
    })
    .sort((a, b) => {
      if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
      if (Math.abs(b.docDiff) !== Math.abs(a.docDiff)) return Math.abs(b.docDiff) - Math.abs(a.docDiff);
      return a.product_title.localeCompare(b.product_title);
    });
}

export type ReceivingTotals = {
  lines: number;
  matched: number;
  unmatched: number;
  unitsArrived: number;
  discrepancies: number; // lines where arrived ≠ document
};

export function receivingTotals(items: ReceivingItem[]): ReceivingTotals {
  const rows = receivingRows(items);
  return {
    lines: rows.length,
    matched: rows.filter((r) => !r.unknown).length,
    unmatched: rows.filter((r) => r.unknown).length,
    unitsArrived: rows.reduce((sum, r) => sum + r.qty, 0),
    discrepancies: rows.filter((r) => r.docDiff !== 0).length,
  };
}

export type FreshOnHand = { inventoryItemId: string; onHand: number | null };

/**
 * The additive Shopify write: for each matched item with a positive arrived
 * quantity and a resolvable variant, `quantity = current on-hand + arrived`.
 * Unknown/zero-arrived/unresolved rows are skipped — nothing is guessed.
 */
export function buildReceivingWrites(
  items: ReceivingItem[],
  freshByBarcode: Map<string, FreshOnHand>,
): { inventoryItemId: string; quantity: number; barcode: string }[] {
  const writes: { inventoryItemId: string; quantity: number; barcode: string }[] = [];
  for (const item of items) {
    if (item.unknown || item.qty <= 0) continue;
    const fresh = freshByBarcode.get(item.barcode);
    if (!fresh) continue;
    writes.push({
      inventoryItemId: fresh.inventoryItemId,
      quantity: (fresh.onHand ?? 0) + item.qty,
      barcode: item.barcode,
    });
  }
  return writes;
}
