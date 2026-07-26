"use client";

import { useTableSort } from "@/lib/use-table-sort";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PushItemToggle } from "@/components/inventory/push-item-toggle";

export type PushItemRow = {
  id: string;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
  barcode: string;
  book_qty: number;
  shopify_qty: number;
  delta: number;
  excluded: boolean;
  apply_status: string | null;
  apply_error: string | null;
};

/** The Shopify-push review table. Rows arrive in the server's default order
 *  (excluded last, biggest change first); headers add click-to-sort on top. */
export function PushItemsTable({ items }: { items: PushItemRow[] }) {
  const { rows, sort, onSort } = useTableSort(items, {
    product: (r) => r.product_title,
    sku: (r) => r.sku,
    barcode: (r) => r.barcode,
    book: (r) => r.book_qty,
    shopify: (r) => r.shopify_qty,
    delta: (r) => r.delta,
  });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortKey="product" sort={sort} onSort={onSort}>Product</TableHead>
          <TableHead sortKey="sku" sort={sort} onSort={onSort} className="hidden sm:table-cell">SKU</TableHead>
          <TableHead sortKey="barcode" sort={sort} onSort={onSort} className="hidden md:table-cell">Barcode</TableHead>
          <TableHead sortKey="book" sort={sort} onSort={onSort} className="text-right">Book</TableHead>
          <TableHead sortKey="shopify" sort={sort} onSort={onSort} className="text-right">Shopify on hand</TableHead>
          <TableHead sortKey="delta" sort={sort} onSort={onSort} className="text-right">Delta</TableHead>
          <TableHead className="text-right">Include</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} className={cn(r.excluded && "opacity-50")}>
            <TableCell>
              <span className="font-medium">{r.product_title}</span>
              {r.variant_title && (
                <span className="text-muted-foreground ml-2 text-xs">{r.variant_title}</span>
              )}
              {r.apply_status === "written" && (
                <Badge variant="outline" className="ml-2 text-emerald-600">written</Badge>
              )}
              {r.apply_status === "failed" && (
                <Badge variant="outline" className="ml-2 text-red-600">
                  failed{r.apply_error ? ` — ${r.apply_error}` : ""}
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground hidden tabular-nums sm:table-cell">
              {r.sku ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground hidden tabular-nums md:table-cell">
              {r.barcode}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{r.book_qty}</TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {r.shopify_qty}
            </TableCell>
            <TableCell
              className={cn(
                "text-right font-semibold tabular-nums",
                r.delta > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400",
              )}
            >
              {r.delta > 0 ? `+${r.delta}` : r.delta}
            </TableCell>
            <TableCell className="text-right">
              <PushItemToggle
                itemId={r.id}
                excluded={r.excluded}
                disabled={r.apply_status === "written"}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
