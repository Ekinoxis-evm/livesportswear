"use client";

import { useState } from "react";
import type {
  ShiftTotalRow,
  WeekdayShiftGrid,
} from "@/lib/scheduling/shift-grid";
import { ScrollTable } from "@/components/shared/scroll-table";
import { SortableTh } from "@/components/shared/sortable-header";
import { useTableSort } from "@/lib/use-table-sort";
import { Cell, SHORT_WEEKDAYS } from "@/components/schedule/shift-cell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type View = "totals" | "weekday";

/**
 * The all-time shift picture in one box, two views: "Totals" (per person, the
 * reduced AM/PM/Total summary) and "By weekday" (per person per weekday — how
 * many Monday AM / Monday PM … shifts they've ever worked). Both read the same
 * history; the toggle just changes the grain.
 */
export function AllTimeShifts({
  totals,
  weekday,
  colorById,
}: {
  totals: ShiftTotalRow[];
  weekday: WeekdayShiftGrid;
  colorById: Map<string, string | null>;
}) {
  const [view, setView] = useState<View>("totals");

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">Shifts all-time</CardTitle>
          <CardDescription>
            {view === "totals"
              ? "Total shifts per person across every week — AM (before noon) · PM."
              : "Shifts per person per weekday, across every week — AM · PM."}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-1">
          {(
            [
              ["totals", "Totals"],
              ["weekday", "By weekday"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={
                "rounded-full border px-2.5 py-1 text-xs " +
                (view === v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted")
              }
            >
              {label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {view === "totals" ? (
          <TotalsTable rows={totals} colorById={colorById} />
        ) : (
          <WeekdayTable grid={weekday} />
        )}
      </CardContent>
    </Card>
  );
}

function TotalsTable({
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
  const { rows: sorted, sort, onSort } = useTableSort(rows, {
    name: (r) => r.name,
    am: (r) => r.am,
    pm: (r) => r.pm,
    total: (r) => r.total,
  });
  return (
    <ScrollTable maxHeight="30rem">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <SortableTh sortKey="name" sort={sort} onSort={onSort} className="py-2 font-medium">Employee</SortableTh>
            <SortableTh sortKey="am" sort={sort} onSort={onSort} className="py-2 text-right font-medium">AM</SortableTh>
            <SortableTh sortKey="pm" sort={sort} onSort={onSort} className="py-2 text-right font-medium">PM</SortableTh>
            <SortableTh sortKey="total" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Total</SortableTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
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
  );
}

function WeekdayTable({ grid }: { grid: WeekdayShiftGrid }) {
  const grandTotal = grid.rows.reduce((a, r) => a + r.total, 0);
  return (
    <ScrollTable maxHeight="30rem">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-schedule-header text-schedule-rail-foreground">
            <th className="bg-schedule-rail text-schedule-rail-foreground sticky left-0 z-10 p-2 text-left font-medium">
              Employee
            </th>
            {SHORT_WEEKDAYS.map((d) => (
              <th key={d} className="min-w-24 p-2 text-center font-medium">
                {d}
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
            <td className="p-2 text-center tabular-nums">{grandTotal}</td>
          </tr>
        </tbody>
      </table>
    </ScrollTable>
  );
}
