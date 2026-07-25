"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { SortButton, ariaSort } from "@/components/shared/sortable-header"
import type { SortState } from "@/lib/use-table-sort"

function Table({
  className,
  maxHeight,
  density = "compact",
  stickyHeader = true,
  ...props
}: React.ComponentProps<"table"> & {
  /** Caps the vertical run so long lists scroll in place. Omit for no cap. */
  maxHeight?: string
  /** `comfortable` = roomier rows + bigger touch targets, for the kiosk iPad. */
  density?: "compact" | "comfortable"
  stickyHeader?: boolean
}) {
  return (
    <div
      data-slot="table-container"
      // Mirrors ScrollTable (components/shared/scroll-table.tsx) so shadcn and
      // hand-rolled tables feel identical: sticky header, both-axis scroll, the
      // right-edge scrolling shadow, and hover only on real pointer devices.
      className={cn(
        "scroll-table relative w-full overflow-auto overscroll-contain",
        stickyHeader && [
          "[&_thead_th]:bg-card [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
          "[&_thead_th]:after:bg-border [&_thead_th]:after:absolute [&_thead_th]:after:inset-x-0",
          "[&_thead_th]:after:bottom-0 [&_thead_th]:after:h-px [&_thead_th]:after:content-['']",
        ],
        density === "comfortable" && "[&_thead_th]:h-12 [&_tbody_td]:py-3",
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        // Hover only where a real pointer exists — on touch the hover state
        // sticks to the last row tapped. `active:` gives touch its feedback.
        "border-b transition-colors active:bg-muted [@media(hover:hover)]:hover:bg-muted/50",
        "has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  sortKey,
  sort,
  onSort,
  children,
  ...props
}: React.ComponentProps<"th"> & {
  /** Pass all three to make this header click-to-sort (from useTableSort). */
  sortKey?: string
  sort?: SortState
  onSort?: (key: string) => void
}) {
  const sortable = sortKey != null && sort !== undefined && onSort != null
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      aria-sort={sortable ? ariaSort(sort, sortKey) : undefined}
      {...props}
    >
      {sortable ? (
        <SortButton sortKey={sortKey} sort={sort} onSort={onSort}>
          {children}
        </SortButton>
      ) : (
        children
      )}
    </th>
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
