import type { ShiftTotalRow } from "@/lib/scheduling/shift-grid";
import { ScrollTable } from "@/components/shared/scroll-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const firstName = (name: string) => name.trim().split(/\s+/)[0];

/** A count that dims to nothing when it's zero. */
function Count({ n }: { n: number }) {
  return (
    <span className={"tabular-nums " + (n > 0 ? "font-medium" : "text-muted-foreground/40")}>
      {n}
    </span>
  );
}

/**
 * This week's shifts at a glance: employees across the columns, AM / PM / Total
 * down the rows (no day-of-week split — the all-time views cover the detail).
 * Server-rendered per week, so it updates as the admin builds the schedule.
 */
export function ShiftCountGrid({ rows }: { rows: ShiftTotalRow[] }) {
  const all = rows.reduce(
    (a, r) => ({ am: a.am + r.am, pm: a.pm + r.pm, total: a.total + r.total }),
    { am: 0, pm: 0, total: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Shift counts · this week</CardTitle>
        <CardDescription>
          AM (before noon) · PM shifts per person — updates as you build the week.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollTable maxHeight="24rem">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-schedule-header text-schedule-rail-foreground">
                <th className="bg-schedule-rail text-schedule-rail-foreground sticky left-0 z-10 p-2 text-left font-medium" />
                {rows.map((r) => (
                  <th key={r.employeeId} className="min-w-16 p-2 text-center font-medium">
                    {firstName(r.name)}
                  </th>
                ))}
                <th className="p-2 text-center font-medium">All</th>
              </tr>
            </thead>
            <tbody>
              {(["am", "pm"] as const).map((half) => (
                <tr key={half} className="border-b">
                  <td className="bg-background text-muted-foreground sticky left-0 z-10 p-2 text-xs font-medium uppercase">
                    {half}
                  </td>
                  {rows.map((r) => (
                    <td key={r.employeeId} className="p-2 text-center">
                      <Count n={r[half]} />
                    </td>
                  ))}
                  <td className="p-2 text-center font-medium tabular-nums">{all[half]}</td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-medium">
                <td className="bg-muted/40 sticky left-0 z-10 p-2 text-xs uppercase">
                  Total
                </td>
                {rows.map((r) => (
                  <td key={r.employeeId} className="p-2 text-center tabular-nums">
                    {r.total}
                  </td>
                ))}
                <td className="p-2 text-center tabular-nums">{all.total}</td>
              </tr>
            </tbody>
          </table>
        </ScrollTable>
      </CardContent>
    </Card>
  );
}
