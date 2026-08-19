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

  // Asked on the no-sale flow only (0061); null on sold rows and pre-0061 rows.
  boughtBefore: string | null; // 'yes' | 'no' | 'unsure'
  knewBrand: string | null;
  reasons: string[] | null; // why they didn't buy — on ~82% of events
  note: string | null; // the rep's own words; rare (~5%) and short
};

const ANSWER_LABEL: Record<string, string> = {
  yes: "Yes",
  no: "No",
  unsure: "Not sure",
};

type Filter = "all" | "sold" | "nosale";

/** Every column carries one variable, ordered so the ones read on the floor sit
 *  left of the fold. Time and Customer are the two that earn their width least
 *  (Customer is filled on ~7% of rows), so they are the first to go on a narrow
 *  screen — never Result, the two profile answers, or the reason. */
export function AttendanceToday({
  rows,
  currency,
}: {
  rows: AttendanceRow[];
  currency: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  // A note is ~27 chars on average but can run to 300; show it inline and let
  // the row grow on tap rather than spending a wide column on a mostly-empty
  // field or hiding the text behind a tooltip nobody finds on a touchscreen.
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const toggleNote = (id: string) =>
    setOpenNotes((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = rows.filter(
    (r) => filter === "all" || (filter === "sold" ? r.sold : !r.sold),
  );
  const soldCount = rows.filter((r) => r.sold).length;
  const {
    rows: shown,
    sort,
    onSort,
  } = useTableSort(filtered, {
    rep: (r) => r.rep,
    time: (r) => r.time,
    result: (r) => (r.sold ? 1 : 0),
    boughtBefore: (r) => r.boughtBefore,
    knewBrand: (r) => r.knewBrand,
    reason: (r) => r.reasons?.[0] ?? null,
    note: (r) => r.note,
    duration: (r) => r.servedSeconds,
    customer: (r) => r.customer,
    order: (r) => r.orderTotal,
  });

  const answer = (v: string | null) =>
    v ? (ANSWER_LABEL[v] ?? v) : <span className="text-muted-foreground/50">—</span>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Clients attended</CardTitle>
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
            {rows.length === 0
              ? "No clients logged yet."
              : "None in this filter."}
          </p>
        ) : (
          <ScrollTable density="comfortable">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <SortableTh sortKey="rep" sort={sort} onSort={onSort} className="py-2 font-medium">
                    Salesperson
                  </SortableTh>
                  <SortableTh sortKey="time" sort={sort} onSort={onSort} className="hidden py-2 font-medium sm:table-cell">
                    Time
                  </SortableTh>
                  <SortableTh sortKey="result" sort={sort} onSort={onSort} className="py-2 font-medium">
                    Result
                  </SortableTh>
                  <SortableTh sortKey="boughtBefore" sort={sort} onSort={onSort} className="py-2 font-medium">
                    Bought before
                  </SortableTh>
                  <SortableTh sortKey="knewBrand" sort={sort} onSort={onSort} className="py-2 font-medium">
                    Knew LIVE!
                  </SortableTh>
                  <SortableTh sortKey="reason" sort={sort} onSort={onSort} className="py-2 font-medium">
                    Reason
                  </SortableTh>
                  <SortableTh sortKey="note" sort={sort} onSort={onSort} className="py-2 font-medium">
                    Note
                  </SortableTh>
                  <SortableTh sortKey="duration" sort={sort} onSort={onSort} className="py-2 text-right font-medium">
                    Duration
                  </SortableTh>
                  <SortableTh sortKey="customer" sort={sort} onSort={onSort} className="hidden py-2 font-medium xl:table-cell">
                    Customer
                  </SortableTh>
                  <SortableTh sortKey="order" sort={sort} onSort={onSort} className="py-2 text-right font-medium">
                    Order
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const open = openNotes.has(r.id);
                  return (
                    <tr key={r.id} className="border-b last:border-0 align-top">
                      <td className="py-2 font-medium">
                        {r.rep}
                        {r.isReturn && (
                          <Badge variant="outline" className="ml-1.5 align-middle capitalize">
                            {r.returnType ?? "return"}
                          </Badge>
                        )}
                      </td>
                      <td className="text-muted-foreground hidden py-2 tabular-nums sm:table-cell">
                        {r.time}
                      </td>
                      <td className="py-2">
                        <span className="flex flex-wrap items-center gap-1.5">
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
                        </span>
                      </td>
                      <td className="py-2">{answer(r.boughtBefore)}</td>
                      <td className="py-2">{answer(r.knewBrand)}</td>
                      <td className="text-muted-foreground py-2">
                        {r.reasons?.length ? (
                          <span className="flex flex-wrap gap-1">
                            {r.reasons.map((x) => (
                              <Badge key={x} variant="outline" className="font-normal">
                                {x}
                              </Badge>
                            ))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="text-muted-foreground py-2">
                        {r.note ? (
                          <button
                            type="button"
                            onClick={() => toggleNote(r.id)}
                            className="text-foreground/80 hover:text-foreground max-w-[14rem] text-left"
                            title={open ? "Tap to collapse" : "Tap to read"}
                          >
                            <span className={open ? "" : "line-clamp-1"}>{r.note}</span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="text-muted-foreground py-2 text-right tabular-nums">
                        {formatDuration(r.servedSeconds)}
                      </td>
                      <td className="text-muted-foreground hidden py-2 xl:table-cell">
                        {r.customer ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {r.orderTotal != null ? (
                          <span className="flex flex-col items-end leading-tight">
                            <span className="font-medium">
                              {formatMoney(r.orderTotal, currency)}
                            </span>
                            {r.orderName && (
                              <span className="text-muted-foreground text-xs">
                                {r.orderName}
                                {r.orderCount > 1 && ` +${r.orderCount - 1}`}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollTable>
        )}
      </CardContent>
    </Card>
  );
}
