import { cn } from "@/lib/utils";

/**
 * The shell every data table sits in. Makes a table read as live rather than
 * printed:
 *
 * - scrolls both ways, capped at `maxHeight` so a long list scrolls in place
 *   instead of pushing the page down
 * - the header stays put, so you never lose which column you're reading
 * - the first column pins while you scroll sideways, so rows keep their identity
 * - a shadow on the right edge appears ONLY while there's more to scroll to,
 *   which is what stops a wide table reading as truncated
 *
 * Wrap a plain <table>; everything is applied by descendant selectors so call
 * sites keep their own markup and their own `hidden sm:table-cell` rules.
 *
 * NOT for the schedule calendar grids (schedule-grid/schedule-board) — those use
 * <table> for week layout, and pinning would fight their drag-and-drop.
 */
export function ScrollTable({
  children,
  maxHeight = "32rem",
  density = "compact",
  stickyFirstColumn = true,
  className,
}: {
  children: React.ReactNode;
  maxHeight?: string;
  /** `comfortable` = roomier rows + bigger touch targets, for the kiosk iPad. */
  density?: "compact" | "comfortable";
  stickyFirstColumn?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "scroll-table relative overflow-auto overscroll-contain rounded-md border",
        // Header: sticky, opaque (rows must not show through), and carrying its
        // own bottom rule — the table's collapsed border scrolls away with it.
        "[&_thead_th]:bg-card [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
        "[&_thead_th]:after:bg-border [&_thead_th]:after:absolute [&_thead_th]:after:inset-x-0",
        "[&_thead_th]:after:bottom-0 [&_thead_th]:after:h-px [&_thead_th]:after:content-['']",
        "[&_table]:w-full [&_table]:min-w-max [&_th]:whitespace-nowrap",
        // Row feedback: hover only where there's a real pointer, press feedback
        // everywhere — without the media query, touch devices keep the hover
        // state stuck on the last row tapped.
        "[&_tbody_tr]:transition-colors [&_tbody_tr]:active:bg-muted",
        "[@media(hover:hover)]:[&_tbody_tr:hover]:bg-muted/50",
        stickyFirstColumn && [
          "[&_tbody_td:first-child]:bg-card [&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0",
          // Above the row's own background, below the sticky header.
          "[&_tbody_td:first-child]:z-[5]",
          // The corner cell is sticky on both axes and must win over both.
          "[&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-20",
          // A hairline down the pinned column's right edge. Without it, columns
          // sliding underneath butt straight against the identity text and read
          // as clipped rather than as scrolled-under.
          "[&_tbody_td:first-child]:shadow-[1px_0_0_0_var(--border)]",
          "[&_thead_th:first-child]:shadow-[1px_0_0_0_var(--border)]",
        ],
        density === "comfortable"
          ? "[&_thead_th]:py-3 [&_tbody_td]:py-3 [&_thead_th]:px-3 [&_tbody_td]:px-3"
          : "[&_thead_th]:px-3 [&_tbody_td]:px-3",
        className,
      )}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}
