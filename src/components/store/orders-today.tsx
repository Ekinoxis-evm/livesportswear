"use client";

import { formatMoney } from "@/lib/commission";
import type { PersonRow } from "@/lib/orders-today";
import { ScrollTable } from "@/components/shared/scroll-table";
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
  net: number;
};

export function OrdersToday({
  total,
  perPerson,
  rows,
  currency,
}: {
  total: { orders: number; net: number };
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
          <span className="text-foreground font-semibold">{formatMoney(total.net, currency)}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Per-salesperson */}
        <div>
          <h3 className="mb-2 text-sm font-medium">By salesperson</h3>
          {perPerson.length === 0 ? (
            <p className="text-muted-foreground text-sm">No sales attributed yet.</p>
          ) : (
            <ScrollTable density="comfortable">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-2 font-medium">Salesperson</th>
                    <th className="py-2 text-right font-medium">Orders</th>
                    <th className="hidden py-2 text-right font-medium sm:table-cell">Net</th>
                    <th className="py-2 text-right font-medium">Avg ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {perPerson.map((p) => (
                    <tr key={p.staffId} className="border-b last:border-0">
                      <td className="py-2 font-medium">{p.name}</td>
                      <td className="py-2 text-right tabular-nums">{p.orders}</td>
                      <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                        {formatMoney(p.net, currency)}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {formatMoney(p.avgTicket, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
        </div>

        {/* Order list */}
        {rows.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">All orders</h3>
            <ScrollTable density="comfortable">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-2 font-medium">Order</th>
                    <th className="hidden py-2 font-medium sm:table-cell">Time</th>
                    <th className="hidden py-2 font-medium sm:table-cell">Seller</th>
                    <th className="py-2 text-right font-medium">Net</th>
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
                      <td className="py-2 text-right tabular-nums">{formatMoney(o.net, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
