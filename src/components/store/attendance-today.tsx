"use client";

import { useState } from "react";
import { ScrollTable } from "@/components/shared/scroll-table";
import { SortableTh } from "@/components/shared/sortable-header";
import { useTableSort } from "@/lib/use-table-sort";
import { Check, X } from "lucide-react";
import { formatMoney } from "@/lib/commission";
import { formatDuration } from "@/lib/conversion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type AttendanceRow = {
  id: string;
  time: string; // HH:mm in store tz
  rep: string;
  isReturn: boolean;
  returnType: string | null; // 'return' | 'exchange' | 'both'
  sold: boolean;
  gotContact: boolean;
  servedSeconds: number | null; // how long attended

  orderName: string | null;
  orderTotal: number | null;
  orderCount: number; // linked orders (>1 = split across receipts)
  customer: string | null;
};

type Filter = "all" | "sold" | "nosale";

export function AttendanceToday({
  rows,
  currency,
}: {
  rows: AttendanceRow[];
  currency: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const filtered = rows.filter(
    (r) => filter === "all" || (filter === "sold" ? r.sold : !r.sold),
  );
  const soldCount = rows.filter((r) => r.sold).length;
  const { rows: shown, sort, onSort } = useTableSort(filtered, {
    time: (r) => r.time,
    rep: (r) => r.rep,
    result: (r) => (r.sold ? 1 : 0),
    duration: (r) => r.servedSeconds,
    customer: (r) => r.customer,
    order: (r) => r.orderTotal,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Clients attended today</CardTitle>
        <CardDescription>
          Every walk-in logged on the floor and how it went.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-1">
          {(
            [
              ["all", `All ${rows.length}`],
              ["sold", `Sold ${soldCount}`],
              ["nosale", `No sale ${rows.length - soldCount}`],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                "rounded-full border px-2.5 py-1 text-xs " +
                (filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted")
              }
            >
              {label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {rows.length === 0 ? "No clients logged yet today." : "None in this filter."}
          </p>
        ) : (
          <ScrollTable density="comfortable">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <SortableTh sortKey="time" sort={sort} onSort={onSort} className="hidden py-2 font-medium sm:table-cell">Time</SortableTh>
                  <SortableTh sortKey="rep" sort={sort} onSort={onSort} className="py-2 font-medium">Salesperson</SortableTh>
                  <SortableTh sortKey="result" sort={sort} onSort={onSort} className="py-2 font-medium">Result</SortableTh>
                  <SortableTh sortKey="duration" sort={sort} onSort={onSort} className="hidden py-2 text-right font-medium sm:table-cell">Time</SortableTh>
                  <SortableTh sortKey="customer" sort={sort} onSort={onSort} className="hidden py-2 font-medium sm:table-cell">Customer</SortableTh>
                  <SortableTh sortKey="order" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Order</SortableTh>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 align-top">
                    <td className="text-muted-foreground hidden py-2 tabular-nums sm:table-cell">
                      {r.time}
                    </td>
                    <td className="py-2 font-medium">
                      {r.rep}
                      {r.isReturn && (
                        <Badge variant="outline" className="ml-1.5 align-middle capitalize">
                          {r.returnType ?? "return"}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.sold ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                            <Check className="size-3.5" /> Sold
                          </span>
                        ) : (
                          <span className="text-muted-foreground inline-flex items-center gap-1">
                            <X className="size-3.5" /> No sale
                          </span>
                        )}
                        {r.gotContact && <Badge variant="secondary">contact</Badge>}
                      </div>
                    </td>
                    <td className="text-muted-foreground hidden py-2 text-right tabular-nums sm:table-cell">
                      {formatDuration(r.servedSeconds)}
                    </td>
                    <td className="text-muted-foreground hidden py-2 sm:table-cell">
                      {r.customer ?? "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.orderTotal != null ? (
                        <>
                          <span className="font-medium">{formatMoney(r.orderTotal, currency)}</span>
                          {r.orderName && (
                            <span className="text-muted-foreground block text-xs">
                              {r.orderName}
                              {r.orderCount > 1 && ` +${r.orderCount - 1}`}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </CardContent>
    </Card>
  );
}
