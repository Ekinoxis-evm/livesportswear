"use client";

import { useTableSort } from "@/lib/use-table-sort";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ReceivedRow = {
  barcode: string;
  product_title: string;
  variant_title: string | null;
  unknown: boolean;
  qty: number;
  newTotal: number;
};

/** Finalized receiving session — lines received. */
export function ReceivedLinesTable({ rows: input }: { rows: ReceivedRow[] }) {
  const { rows, sort, onSort } = useTableSort(input, {
    product: (r) => r.product_title,
    arrived: (r) => r.qty,
    total: (r) => (r.unknown ? null : r.newTotal),
  });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortKey="product" sort={sort} onSort={onSort}>Product</TableHead>
          <TableHead sortKey="arrived" sort={sort} onSort={onSort} className="text-right">Arrived</TableHead>
          <TableHead sortKey="total" sort={sort} onSort={onSort} className="text-right">New total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.barcode}>
            <TableCell>
              <span className="font-medium">{r.product_title}</span>
              {r.variant_title && (
                <span className="text-muted-foreground ml-2 text-xs">{r.variant_title}</span>
              )}
              {r.unknown && (
                <Badge variant="outline" className="ml-2 text-amber-600">
                  unmatched · skipped
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {r.unknown ? "—" : r.newTotal}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export type VarianceRow = {
  barcode: string;
  product_title: string;
  variant_title: string | null;
  product_type: string | null;
  unknown: boolean;
  sku: string | null;
  qty: number;
  expected: number | null;
  diff: number | null;
};

/** Finalized count session — the variance report. */
export function VarianceReportTable({ rows: input }: { rows: VarianceRow[] }) {
  const { rows, sort, onSort } = useTableSort(input, {
    product: (r) => r.product_title,
    sku: (r) => r.sku ?? r.barcode,
    counted: (r) => r.qty,
    shopify: (r) => r.expected,
    diff: (r) => r.diff,
  });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortKey="product" sort={sort} onSort={onSort}>Product</TableHead>
          <TableHead sortKey="sku" sort={sort} onSort={onSort} className="hidden sm:table-cell">SKU</TableHead>
          <TableHead sortKey="counted" sort={sort} onSort={onSort} className="text-right">Counted</TableHead>
          <TableHead sortKey="shopify" sort={sort} onSort={onSort} className="text-right">In Shopify</TableHead>
          <TableHead sortKey="diff" sort={sort} onSort={onSort} className="text-right">Diff</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.barcode}>
            <TableCell>
              <span className="font-medium">{r.product_title}</span>
              {r.variant_title && (
                <span className="text-muted-foreground ml-2 text-xs">{r.variant_title}</span>
              )}
              {r.product_type && (
                <span className="text-muted-foreground ml-2 text-[10px] uppercase tracking-wide">
                  {r.product_type}
                </span>
              )}
              {r.unknown && (
                <Badge variant="outline" className="ml-2 text-amber-600">
                  unknown barcode
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground hidden tabular-nums sm:table-cell">
              {r.sku ?? r.barcode}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {r.expected ?? "—"}
            </TableCell>
            <TableCell
              className={
                "text-right font-medium tabular-nums " +
                (r.diff == null
                  ? "text-muted-foreground"
                  : r.diff < 0
                    ? "text-destructive"
                    : r.diff > 0
                      ? "text-amber-600"
                      : "text-emerald-600")
              }
            >
              {r.diff == null ? "—" : r.diff > 0 ? `+${r.diff}` : r.diff}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
