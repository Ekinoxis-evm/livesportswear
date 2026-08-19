"use client";

import { ScrollTable } from "@/components/shared/scroll-table";
import { SortableTh } from "@/components/shared/sortable-header";
import { useTableSort } from "@/lib/use-table-sort";

export type AttributionRow = {
  staff: string | null;
  name: string;
  active: boolean | null;
  mapped: boolean;
  clients: number;
};

/** A server page can't hold sort state, so the table is a thin client wrapper
 *  fed serializable rows — the pattern used by every other sortable table here. */
export function AttributionTable({
  rows,
  attributedTotal,
}: {
  rows: AttributionRow[];
  attributedTotal: number;
}) {
  const {
    rows: shown,
    sort,
    onSort,
  } = useTableSort(
    rows,
    {
      rep: (r) => r.name,
      clients: (r) => r.clients,
    },
    { key: "clients", dir: "desc" },
  );

  return (
    <ScrollTable maxHeight="30rem">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <SortableTh sortKey="rep" sort={sort} onSort={onSort} className="py-2 font-medium">
              Rep
            </SortableTh>
            <SortableTh sortKey="clients" sort={sort} onSort={onSort} className="py-2 text-right font-medium">
              Clients
            </SortableTh>
            <th className="py-2 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.staff || "none"} className="border-b last:border-0">
              <td className="py-2 font-medium">
                <span
                  className={
                    r.mapped
                      ? r.active === false
                        ? "text-muted-foreground"
                        : ""
                      : "text-muted-foreground italic"
                  }
                >
                  {r.name}
                </span>
                {r.mapped && r.active === false && (
                  <span className="text-muted-foreground ml-1.5 text-xs">(inactive)</span>
                )}
              </td>
              <td className="py-2 text-right tabular-nums">{r.clients.toLocaleString()}</td>
              <td className="text-muted-foreground py-2 text-right tabular-nums">
                {attributedTotal > 0
                  ? `${Math.round((r.clients / attributedTotal) * 100)}%`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}
