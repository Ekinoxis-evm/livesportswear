"use client";

import { ScrollTable } from "@/components/shared/scroll-table";
import { SortableTh } from "@/components/shared/sortable-header";
import { useTableSort } from "@/lib/use-table-sort";
import { formatPct } from "@/lib/conversion";

export type TeamTodayRow = {
  employeeId: string;
  name: string;
  attended: number;
  sold: number;
  conversion: number;
  returns: number;
  hours: number | null;
};

/** The kiosk "Team today" table — sortable per column. */
export function TeamTodayTable({ rows: input }: { rows: TeamTodayRow[] }) {
  const { rows, sort, onSort } = useTableSort(input, {
    name: (r) => r.name,
    attended: (r) => r.attended,
    sold: (r) => r.sold,
    conversion: (r) => (r.attended > 0 ? r.conversion : null),
    returns: (r) => r.returns,
    hours: (r) => r.hours,
  });
  return (
    <ScrollTable density="comfortable">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left">
            <SortableTh sortKey="name" sort={sort} onSort={onSort} className="py-2 font-medium">Employee</SortableTh>
            <SortableTh sortKey="attended" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Attended</SortableTh>
            <SortableTh sortKey="sold" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Sold</SortableTh>
            <SortableTh sortKey="conversion" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Conversion</SortableTh>
            <SortableTh sortKey="returns" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Returns</SortableTh>
            <SortableTh sortKey="hours" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Hours</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.employeeId} className="border-b last:border-0">
              <td className="py-2 font-medium">{p.name}</td>
              <td className="py-2 text-right tabular-nums">{p.attended}</td>
              <td className="py-2 text-right tabular-nums">{p.sold}</td>
              <td className="py-2 text-right tabular-nums">
                {p.attended > 0 ? formatPct(p.conversion) : "—"}
              </td>
              <td className="py-2 text-right tabular-nums">
                {p.returns > 0 ? p.returns : "—"}
              </td>
              <td className="py-2 text-right tabular-nums">{p.hours ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}
