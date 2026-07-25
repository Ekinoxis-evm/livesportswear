"use client";

import { ScrollTable } from "@/components/shared/scroll-table";
import { SortableTh } from "@/components/shared/sortable-header";
import {
  useTableSort,
  type Accessors,
  type SortState,
  type SortValue,
} from "@/lib/use-table-sort";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Comparable value for this column; omit to make the column non-sortable. */
  sort?: (row: T) => SortValue;
  /** Shared by the `<th>` and every `<td>` — alignment, width, hidden-below. */
  className?: string;
  align?: "left" | "right" | "center";
};

const alignClass = (a?: "left" | "right" | "center") =>
  a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

/**
 * The one sortable data table used across the app. Give it column defs (header,
 * how to render a cell, and — for sortable columns — a comparable accessor) plus
 * the rows; it renders inside the shared `ScrollTable` shell with click-to-sort
 * headers. The first column pins by default (`ScrollTable`), matching the rest
 * of the app's tables. Non-list layouts (calendar grids) do NOT use this.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  maxHeight = "32rem",
  density,
  stickyFirstColumn = true,
  emptyMessage = "Nothing to show.",
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  initialSort?: SortState;
  maxHeight?: string;
  density?: "compact" | "comfortable";
  stickyFirstColumn?: boolean;
  emptyMessage?: React.ReactNode;
  className?: string;
}) {
  const accessors: Accessors<T> = {};
  for (const c of columns) if (c.sort) accessors[c.key] = c.sort;
  const { rows: sorted, sort, onSort } = useTableSort(rows, accessors, initialSort);

  return (
    <ScrollTable
      maxHeight={maxHeight}
      density={density}
      stickyFirstColumn={stickyFirstColumn}
    >
      <table className={cn("w-full text-sm", className)}>
        <thead>
          <tr className="text-muted-foreground border-b">
            {columns.map((c) =>
              c.sort ? (
                <SortableTh
                  key={c.key}
                  sortKey={c.key}
                  sort={sort}
                  onSort={onSort}
                  className={cn("py-2 font-medium", alignClass(c.align), c.className)}
                >
                  {c.header}
                </SortableTh>
              ) : (
                <th
                  key={c.key}
                  className={cn("py-2 font-medium", alignClass(c.align), c.className)}
                >
                  {c.header}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-muted-foreground py-6 text-center"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr key={rowKey(row, i)} className="border-b last:border-0">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn("py-2", alignClass(c.align), c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </ScrollTable>
  );
}
