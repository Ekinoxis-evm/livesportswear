import { cn } from "@/lib/utils";

/**
 * A table viewport that scrolls both ways: horizontally when the columns are
 * wider than the screen, vertically once the rows pass `maxHeight` — with the
 * header staying put so you never lose track of which column you're reading.
 *
 * Wrap a plain <table> in this; the sticky header needs the <thead> cells to
 * carry `bg-card` (they inherit it via the `[&_thead_th]` rule below), so no
 * change is needed at the call site.
 */
export function ScrollTable({
  children,
  maxHeight = "32rem",
  className,
}: {
  children: React.ReactNode;
  maxHeight?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-auto overscroll-contain rounded-md border",
        "[&_thead_th]:bg-card [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
        // The sticky header sits above scrolling rows, so it needs its own rule
        // rather than the table's collapsed border, which scrolls away with it.
        "[&_thead_th]:after:bg-border [&_thead_th]:after:absolute [&_thead_th]:after:inset-x-0",
        "[&_thead_th]:after:bottom-0 [&_thead_th]:after:h-px [&_thead_th]:after:content-['']",
        "[&_table]:w-full [&_table]:min-w-max [&_th]:whitespace-nowrap",
        "[&_thead_th]:px-3 [&_tbody_td]:px-3",
        className,
      )}
      style={{ maxHeight }}
    >
      {children}
    </div>
  );
}
