import type { ShiftTotalRow } from "@/lib/scheduling/shift-grid";
import { ScrollTable } from "@/components/shared/scroll-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * All-time accumulated shift counts per employee — AM / PM / total across every
 * week ever scheduled at this store (including the seeded 2024 history). Each
 * row carries the person's own colour, matching their shifts on the grid.
 */
export function ShiftTotals({
  rows,
  colorById,
}: {
  rows: ShiftTotalRow[];
  colorById: Map<string, string | null>;
}) {
  const grand = rows.reduce(
    (a, r) => ({ am: a.am + r.am, pm: a.pm + r.pm, total: a.total + r.total }),
    { am: 0, pm: 0, total: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Shifts all-time</CardTitle>
        <CardDescription>
          Total shifts per person across every week — AM (before noon) · PM.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollTable maxHeight="30rem">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 font-medium">Employee</th>
                <th className="py-2 text-right font-medium">AM</th>
                <th className="py-2 text-right font-medium">PM</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="border-b last:border-0">
                  <td className="py-2 font-medium">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full border"
                        style={{ backgroundColor: colorById.get(r.employeeId) ?? "transparent" }}
                      />
                      {r.name}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.am}</td>
                  <td className="py-2 text-right tabular-nums">{r.pm}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{r.total}</td>
                </tr>
              ))}
              <tr className="bg-muted/40 font-medium">
                <td className="py-2">All</td>
                <td className="py-2 text-right tabular-nums">{grand.am}</td>
                <td className="py-2 text-right tabular-nums">{grand.pm}</td>
                <td className="py-2 text-right tabular-nums">{grand.total}</td>
              </tr>
            </tbody>
          </table>
        </ScrollTable>
      </CardContent>
    </Card>
  );
}
