import { isoWeekday } from "@/lib/scheduling/week";
import type { ShiftGrid, ShiftCell } from "@/lib/scheduling/shift-grid";
import { ScrollTable } from "@/components/shared/scroll-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SHORT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

function Cell({ cell }: { cell: ShiftCell }) {
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

/**
 * Shift counts for the displayed week: employees down the rows, days across the
 * columns, each cell split AM | PM (AM = starts before noon). Navigate weeks
 * with the picker above; it renders for whichever week is shown.
 */
export function ShiftCountGrid({ grid }: { grid: ShiftGrid }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Shift counts</CardTitle>
        <CardDescription>
          AM (before noon) · PM per person per day, for this week.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollTable maxHeight="30rem">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-schedule-header text-schedule-rail-foreground">
                <th className="bg-schedule-rail text-schedule-rail-foreground sticky left-0 z-10 p-2 text-left font-medium">
                  Employee
                </th>
                {grid.days.map((d) => (
                  <th key={d} className="min-w-24 p-2 text-center font-medium">
                    <span className="opacity-70">
                      {SHORT_WEEKDAYS[isoWeekday(d) - 1]}
                    </span>{" "}
                    <span className="tabular-nums">{d.slice(8, 10)}</span>
                  </th>
                ))}
                <th className="p-2 text-center font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.employeeId} className="border-b last:border-0">
                  <td className="bg-background sticky left-0 z-10 p-2 font-medium whitespace-nowrap">
                    {row.name}
                  </td>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="p-1.5">
                      <Cell cell={cell} />
                    </td>
                  ))}
                  <td className="p-2 text-center font-semibold tabular-nums">
                    {row.total > 0 ? row.total : "—"}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-medium">
                <td className="bg-muted/40 sticky left-0 z-10 p-2">All</td>
                {grid.dayTotals.map((cell, i) => (
                  <td key={i} className="p-2 text-center text-xs tabular-nums">
                    {cell.am}/{cell.pm}
                  </td>
                ))}
                <td className="p-2 text-center tabular-nums">
                  {grid.rows.reduce((a, r) => a + r.total, 0)}
                </td>
              </tr>
            </tbody>
          </table>
        </ScrollTable>
      </CardContent>
    </Card>
  );
}
