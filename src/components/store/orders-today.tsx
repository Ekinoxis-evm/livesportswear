"use client";

import { formatMoney } from "@/lib/commission";
import type { PersonRow } from "@/lib/orders-today";
import { ScrollTable } from "@/components/shared/scroll-table";
import { SortableTh } from "@/components/shared/sortable-header";
import { useTableSort } from "@/lib/use-table-sort";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type OrderListRow = {
  id: string;
  name: string;
  time: string;
  seller: string | null;
  gross: number;
  net: number;
};

export function OrdersToday({
  total,
  perPerson,
  rows,
  currency,
}: {
  total: { orders: number; gross: number; net: number };
  perPerson: PersonRow[];
  rows: OrderListRow[];
  currency: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Orders today</CardTitle>
        <CardDescription>
          In-store POS sales — {total.orders} order{total.orders === 1 ? "" : "s"} ·{" "}
          <span className="text-foreground font-semibold">{formatMoney(total.gross, currency)}</span>{" "}
          value · {formatMoney(total.net, currency)} net
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Per-salesperson */}
        <div>
          <h3 className="mb-2 text-sm font-medium">By salesperson</h3>
          {perPerson.length === 0 ? (
            <p className="text-muted-foreground text-sm">No sales attributed yet.</p>
          ) : (
            <PerPersonTable perPerson={perPerson} currency={currency} />
          )}
        </div>

        {/* Order list */}
        {rows.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">All orders</h3>
            <OrderListTable rows={rows} currency={currency} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PerPersonTable({
  perPerson,
  currency,
}: {
  perPerson: PersonRow[];
  currency: string;
}) {
  const { rows, sort, onSort } = useTableSort(perPerson, {
    name: (p) => p.name,
    orders: (p) => p.orders,
    gross: (p) => p.gross,
    net: (p) => p.net,
    avg: (p) => p.avgTicket,
  });
  return (
    <ScrollTable density="comfortable">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left">
            <SortableTh sortKey="name" sort={sort} onSort={onSort} className="py-2 font-medium">Salesperson</SortableTh>
            <SortableTh sortKey="orders" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Orders</SortableTh>
            <SortableTh sortKey="gross" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Sales</SortableTh>
            <SortableTh sortKey="net" sort={sort} onSort={onSort} className="hidden py-2 text-right font-medium sm:table-cell">Net</SortableTh>
            <SortableTh sortKey="avg" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Avg ticket</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.staffId} className="border-b last:border-0">
              <td className="py-2 font-medium">{p.name}</td>
              <td className="py-2 text-right tabular-nums">{p.orders}</td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {formatMoney(p.gross, currency)}
              </td>
              <td className="text-muted-foreground hidden py-2 text-right tabular-nums sm:table-cell">
                {formatMoney(p.net, currency)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatMoney(p.avgTicket, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}

function OrderListTable({
  rows: input,
  currency,
}: {
  rows: OrderListRow[];
  currency: string;
}) {
  const { rows, sort, onSort } = useTableSort(input, {
    name: (o) => o.name,
    time: (o) => o.time,
    seller: (o) => o.seller,
    value: (o) => o.gross,
  });
  return (
    <ScrollTable density="comfortable">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left">
            <SortableTh sortKey="name" sort={sort} onSort={onSort} className="py-2 font-medium">Order</SortableTh>
            <SortableTh sortKey="time" sort={sort} onSort={onSort} className="hidden py-2 font-medium sm:table-cell">Time</SortableTh>
            <SortableTh sortKey="seller" sort={sort} onSort={onSort} className="hidden py-2 font-medium sm:table-cell">Seller</SortableTh>
            <SortableTh sortKey="value" sort={sort} onSort={onSort} className="py-2 text-right font-medium">Value</SortableTh>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="py-2 font-medium tabular-nums">{o.name}</td>
              <td className="text-muted-foreground hidden py-2 tabular-nums sm:table-cell">
                {o.time}
              </td>
              <td className="text-muted-foreground hidden py-2 sm:table-cell">
                {o.seller ?? "—"}
              </td>
              <td className="py-2 text-right tabular-nums">{formatMoney(o.gross, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}
