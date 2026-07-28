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
  hsCode: z
    .string()
    .trim()
    .max(20)
    .optional()
    .describe("Harmonized-system / customs tariff code printed for this line, if any"),
});
export type ExtractedLine = z.infer<typeof extractedLineSchema>;

const BARCODE_KEYS = ["barcode", "upc", "ean", "gtin", "codigo de barras"];
const SKU_KEYS = ["sku", "style", "style code", "style number", "item", "item code", "reference", "ref", "model", "referencia"];
const QTY_KEYS = ["qty", "quantity", "qty shipped", "quantity shipped", "units", "count", "cantidad"];
const DESC_KEYS = ["description", "product", "name", "title", "item description", "producto", "descripcion"];
const COLOR_KEYS = ["color", "colour", "cor", "colored"];
const HS_KEYS = ["hs code", "hscode", "hs", "harmonized code", "harmonized system", "hts", "tariff", "tariff code", "partida arancelaria", "posicion arancelaria", "ncm"];
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
  const hsCol = pickColumn(keys, HS_KEYS);
  const sizes = sizeColumns(keys);
  if (!refCol || !colorCol || sizes.length < 2) return [];

  const lines: ExtractedLine[] = [];
  for (const row of rows) {
    const reference = String(row[refCol] ?? "").trim();
    const color = String(row[colorCol] ?? "").trim();
    const description = descCol ? String(row[descCol] ?? "").trim() : "";
    const hsCode = hsCol ? String(row[hsCol] ?? "").trim() || undefined : undefined;
    if (!reference || !color) continue; // header/total/blank rows

    for (const { key, size } of sizes) {
      const qty = toInt(row[key]);
      if (qty <= 0) continue;
      lines.push({
        code: `${reference}.${size}.${color}`,
        codeType: "sku",
        description: description ? `${description} · ${size}` : `${reference} · ${size}`,
        qty,
        hsCode,
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
  const hsCol = pickColumn(keys, HS_KEYS);

  const lines: ExtractedLine[] = [];
  for (const row of rows) {
    const barcode = barcodeCol ? String(row[barcodeCol] ?? "").trim() : "";
    const sku = skuCol ? String(row[skuCol] ?? "").trim() : "";
    const qty = qtyCol ? toInt(row[qtyCol]) : 0;
    const description = descCol ? String(row[descCol] ?? "").trim() : "";
    const hsCode = hsCol ? String(row[hsCol] ?? "").trim() || undefined : undefined;

    const code = barcode || sku;
    if (!code || qty <= 0) continue; // empty / total rows
    lines.push({
      code,
      codeType: barcode ? "barcode" : "sku",
      description,
      qty,
      hsCode,
    });
  }
  return lines;
}

/** A receiving count item, once matched (or flagged) against Shopify. */
export type ReceivingItem = {
  id?: string; // count-item row id (present once persisted)
  barcode: string;
  sku: string | null;
  product_title: string;
  variant_title: string | null;
  expected: number | null; // current Shopify on-hand snapshot at match time
  doc_qty: number | null; // what the document said arrived
  qty: number; // physically verified arrived
  unknown: boolean; // not matched to a Shopify variant
  hs_code?: string | null; // customs code from the document (matrix rows)
  verified?: boolean; // rep confirmed this reference's physical units
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

// ---------------------------------------------------------------------------
// New-arrivals MATRIX view — reconstruct the supplier's reference × size grid
// from the matched line items so a rep reviews the document the way it was
// written, then ticks each reference verified. Reference/size/color come back
// out of the SKU (`reference.SIZE.color`); the HS code is stored (0055).
// ---------------------------------------------------------------------------

/** Canonical size order for the matrix columns; unknown sizes sort last, A–Z. */
export const SIZE_ORDER = [
  "XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL",
  "U", "UN", "UNICO", "ÚNICO", "OS", "ONE SIZE",
];

function sizeRank(size: string): number {
  const i = SIZE_ORDER.indexOf(size.toUpperCase());
  return i === -1 ? SIZE_ORDER.length : i;
}

/** Split a `reference.SIZE.color` SKU into its parts, or null if it isn't one. */
export function parseSku(code: string | null | undefined): { reference: string; size: string; color: string } | null {
  if (!code) return null;
  const parts = code.split(".");
  if (parts.length < 3) return null;
  const [reference, size, ...rest] = parts;
  const color = rest.join(".");
  if (!reference || !size || !color) return null;
  return { reference, size, color };
}

export type MatrixCell = {
  size: string;
  docQty: number; // what the document said for this size
  arrivedQty: number; // physically verified so far
  itemId: string | null;
};

export type MatrixRow = {
  reference: string;
  color: string;
  hsCode: string | null;
  description: string;
  cells: MatrixCell[]; // one per size present in THIS row
  docTotal: number;
  arrivedTotal: number;
  verified: boolean; // every size line of this reference is verified
  itemIds: string[];
};

export type MatrixSummary = {
  references: number; // distinct (reference, color) groups
  docPieces: number; // total units per the document
  arrivedPieces: number; // total verified/arrived units
  verifiedReferences: number;
};

export type MatrixView = {
  sizes: string[]; // ordered union of all size columns
  rows: MatrixRow[];
  other: ReceivingItem[]; // lines that don't parse as reference.SIZE.color (barcode/unmatched)
  summary: MatrixSummary;
};

/**
 * Group matched receiving items into the reference × size matrix. Items whose
 * code isn't a `reference.SIZE.color` SKU (plain barcodes, unmatched lines) are
 * returned separately in `other` so the caller can still surface them.
 */
export function matrixView(items: ReceivingItem[]): MatrixView {
  const groups = new Map<string, MatrixRow>();
  const other: ReceivingItem[] = [];
  const sizeSet = new Set<string>();

  for (const item of items) {
    // Unmatched lines go to `other` (with their review hint) even when the code
    // parses as reference.SIZE.color — the matrix is matched references only.
    const parsed = item.unknown ? null : parseSku(item.sku ?? item.barcode);
    if (!parsed) {
      other.push(item);
      continue;
    }
    const key = `${parsed.reference}||${parsed.color}`;
    let row = groups.get(key);
    if (!row) {
      row = {
        reference: parsed.reference,
        color: parsed.color,
        hsCode: item.hs_code ?? null,
        description: item.product_title,
        cells: [],
        docTotal: 0,
        arrivedTotal: 0,
        verified: true,
        itemIds: [],
      };
      groups.set(key, row);
    }
    if (!row.hsCode && item.hs_code) row.hsCode = item.hs_code;
    row.cells.push({
      size: parsed.size,
      docQty: item.doc_qty ?? 0,
      arrivedQty: item.qty,
      itemId: item.id ?? null,
    });
    row.docTotal += item.doc_qty ?? 0;
    row.arrivedTotal += item.qty;
    row.verified = row.verified && !!item.verified;
    if (item.id) row.itemIds.push(item.id);
    sizeSet.add(parsed.size);
  }

  const sizes = [...sizeSet].sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
  const rows = [...groups.values()].sort(
    (a, b) => a.reference.localeCompare(b.reference) || a.color.localeCompare(b.color),
  );
  for (const row of rows) row.cells.sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || a.size.localeCompare(b.size));

  return {
    sizes,
    rows,
    other,
    summary: {
      references: rows.length,
      docPieces: rows.reduce((s, r) => s + r.docTotal, 0),
      arrivedPieces: rows.reduce((s, r) => s + r.arrivedTotal, 0),
      verifiedReferences: rows.filter((r) => r.verified).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Reading-step preview — group the EXTRACTED lines (before matching) into the
// reference × size grid so the admin reviews the document the way it was
// written: per-size quantities, a row total, and a grand total of all pieces.
// ---------------------------------------------------------------------------
export type ExtractMatrixRow = {
  reference: string;
  color: string;
  description: string;
  cells: { size: string; qty: number }[]; // one per size present in THIS row
  total: number;
};

export type ExtractMatrix = {
  sizes: string[]; // ordered union of every size column
  rows: ExtractMatrixRow[];
  other: ExtractedLine[]; // lines whose code isn't reference.SIZE.color
  grandTotal: number; // every piece across the whole document
};

/** Reference × size preview of the raw extracted lines (no Shopify needed). */
export function extractMatrix(lines: ExtractedLine[]): ExtractMatrix {
  const groups = new Map<string, ExtractMatrixRow>();
  const other: ExtractedLine[] = [];
  const sizeSet = new Set<string>();
  let grandTotal = 0;

  for (const line of lines) {
    grandTotal += line.qty;
    const parsed = parseSku(line.code);
    if (!parsed) {
      other.push(line);
      continue;
    }
    const key = `${parsed.reference}||${parsed.color}`;
    let row = groups.get(key);
    if (!row) {
      row = { reference: parsed.reference, color: parsed.color, description: line.description, cells: [], total: 0 };
      groups.set(key, row);
    }
    if (!row.description && line.description) row.description = line.description;
    const cell = row.cells.find((c) => c.size === parsed.size);
    if (cell) cell.qty += line.qty;
    else row.cells.push({ size: parsed.size, qty: line.qty });
    row.total += line.qty;
    sizeSet.add(parsed.size);
  }

  const sizes = [...sizeSet].sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
  const rows = [...groups.values()].sort(
    (a, b) => a.reference.localeCompare(b.reference) || a.color.localeCompare(b.color),
  );
  for (const row of rows) row.cells.sort((a, b) => sizeRank(a.size) - sizeRank(b.size) || a.size.localeCompare(b.size));

  return { sizes, rows, other, grandTotal };
}

// ---------------------------------------------------------------------------
// Reference-based matching — Shopify SKUs are reference.SIZE.color, but the
// document's color text rarely equals Shopify's color code, so matching the
// full assembled SKU misses. Match on the RELIABLE reference (4-5 char prefix)
// + size instead; color only disambiguates when a reference has several colors.
// ---------------------------------------------------------------------------
export type CatalogVariant = {
  barcode: string;
  sku: string | null;
  productTitle: string;
  variantTitle: string | null;
  productType: string | null;
  inventoryQuantity: number | null;
};

export type RefVariant = CatalogVariant & { reference: string; size: string; color: string };

/** Index catalog variants by their SKU reference (skips SKUs that don't parse). */
export function buildReferenceIndex(variants: CatalogVariant[]): Map<string, RefVariant[]> {
  const index = new Map<string, RefVariant[]>();
  for (const v of variants) {
    const parsed = parseSku(v.sku);
    if (!parsed) continue;
    const arr = index.get(parsed.reference) ?? [];
    arr.push({ ...v, ...parsed });
    index.set(parsed.reference, arr);
  }
  return index;
}

export type RefMatch =
  | { status: "matched"; variant: RefVariant }
  | { status: "ambiguous"; reference: string; size: string; candidates: RefVariant[] }
  | { status: "missing"; reference: string | null };

/**
 * Resolve one `reference.SIZE.color` code against the reference index. Matches
 * on reference + size; when several colors share that size, the doc color picks
 * one, else it's ambiguous. Unknown reference (or non-SKU code) is missing.
 */
export function matchByReference(code: string, index: Map<string, RefVariant[]>): RefMatch {
  const parsed = parseSku(code);
  if (!parsed) return { status: "missing", reference: null };
  const { reference, size, color } = parsed;
  const variants = index.get(reference);
  if (!variants || variants.length === 0) return { status: "missing", reference };

  const bySize = variants.filter((v) => v.size.toUpperCase() === size.toUpperCase());
  if (bySize.length === 0) return { status: "ambiguous", reference, size, candidates: variants };
  if (bySize.length === 1) return { status: "matched", variant: bySize[0] };

  const byColor = bySize.filter((v) => v.color.toUpperCase() === color.toUpperCase());
  if (byColor.length === 1) return { status: "matched", variant: byColor[0] };
  return { status: "ambiguous", reference, size, candidates: bySize };
}

/** Distinct colors available for a reference — the review hint for a miss. */
export function candidateColors(candidates: RefVariant[]): string[] {
  return [...new Set(candidates.map((c) => c.color))].sort();
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
