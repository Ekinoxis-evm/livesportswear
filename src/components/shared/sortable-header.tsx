"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { SortState } from "@/lib/use-table-sort";
import { cn } from "@/lib/utils";

/** The `aria-sort` value for a header, for either table style. */
export function ariaSort(
  sort: SortState,
  key: string,
): "ascending" | "descending" | "none" {
  if (sort?.key !== key) return "none";
  return sort.dir === "asc" ? "ascending" : "descending";
}

/**
 * The clickable header label + sort caret. Sits inside a `<th>` (hand-rolled
 * tables) or a `<TableHead>` (shadcn). Inline so it respects the cell's
 * text-align; the caret dims to a neutral up/down until the column is active.
 */
export function SortButton({
  sortKey,
  sort,
  onSort,
  children,
  className,
}: {
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "hover:text-foreground inline-flex items-center gap-1 select-none",
        className,
      )}
    >
      {children}
      {active ? (
        sort!.dir === "asc" ? (
          <ChevronUp className="size-3 shrink-0" aria-hidden />
        ) : (
          <ChevronDown className="size-3 shrink-0" aria-hidden />
        )
      ) : (
        <ChevronsUpDown className="size-3 shrink-0 opacity-40" aria-hidden />
      )}
    </button>
  );
}

/**
 * A sortable `<th>` for hand-rolled tables wrapped in `ScrollTable`. Keeps the
 * caller's existing `<th>` className (alignment, hidden-below rules); the button
 * inherits the cell's text-align.
 */
export function SortableTh({
  sortKey,
  sort,
  onSort,
  children,
  className,
}: {
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={className} aria-sort={ariaSort(sort, sortKey)}>
      <SortButton sortKey={sortKey} sort={sort} onSort={onSort}>
        {children}
      </SortButton>
    </th>
  );
}
