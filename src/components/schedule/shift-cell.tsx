import type { ShiftCell } from "@/lib/scheduling/shift-grid";

export const SHORT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One half of a cell — a count that dims to nothing when it's zero. */
function Half({ label, n }: { label: string; n: number }) {
  return (
    <span className="flex flex-1 flex-col items-center">
      <span className="text-[10px] uppercase opacity-50">{label}</span>
      <span
        className={
          "tabular-nums " + (n > 0 ? "font-semibold" : "text-muted-foreground/40")
        }
      >
        {n}
      </span>
    </span>
  );
}

/** An AM | PM cell used by both the weekly and the all-time weekday grids. */
export function Cell({ cell }: { cell: ShiftCell }) {
  const empty = cell.am === 0 && cell.pm === 0;
  return (
    <div
      className={
        "flex items-stretch gap-px rounded-md border text-sm " +
        (empty ? "opacity-50" : "")
      }
    >
      <Half label="AM" n={cell.am} />
      <span className="bg-border w-px" aria-hidden />
      <Half label="PM" n={cell.pm} />
    </div>
  );
}
