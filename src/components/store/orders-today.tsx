"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/commission";
import type { Channel, ChannelTotals, PersonRow } from "@/lib/orders-today";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type OrderListRow = {
  id: string;
  name: string;
  time: string;
  channel: Channel;
  seller: string | null;
  net: number;
};

type Filter = "all" | "pos" | "online";

function ChannelTile({
  label,
  count,
  net,
  currency,
}: {
  label: string;
  count: number;
  net: number;
  currency: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{count}</div>
      <div className="text-muted-foreground text-sm tabular-nums">
        {formatMoney(net, currency)}
      </div>
    </div>
  );
}

function ChannelBadge({ channel }: { channel: Channel }) {
  return channel === "pos" ? (
    <Badge variant="secondary">In-store</Badge>
  ) : (
    <Badge variant="outline">Online</Badge>
  );
}

export function OrdersToday({
  channelTotals,
  perPerson,
  rows,
  currency,
}: {
  channelTotals: ChannelTotals;
  perPerson: PersonRow[];
  rows: OrderListRow[];
  currency: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const shown = rows.filter((r) => filter === "all" || r.channel === filter);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Orders today</CardTitle>
        <CardDescription>In-store POS vs online, and each seller&apos;s average ticket.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Channel split metric */}
        <div className="grid grid-cols-3 gap-2">
          <ChannelTile label="In-store" count={channelTotals.pos.orders} net={channelTotals.pos.net} currency={currency} />
          <ChannelTile label="Online" count={channelTotals.online.orders} net={channelTotals.online.net} currency={currency} />
          <ChannelTile label="All" count={channelTotals.all.orders} net={channelTotals.all.net} currency={currency} />
        </div>

        {/* Per-salesperson */}
        <div>
          <h3 className="mb-2 text-sm font-medium">By salesperson</h3>
          {perPerson.length === 0 ? (
            <p className="text-muted-foreground text-sm">No in-store sales attributed yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
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
            </div>
          )}
        </div>

        {/* Orders list with channel filter */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">All orders</h3>
            <div className="flex gap-1">
              {(["all", "pos", "online"] as const).map((f) => (
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
                  {f === "all" ? "All" : f === "pos" ? "In-store" : "Online"}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="text-muted-foreground text-sm">No orders yet today.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 font-medium">Order</th>
                    <th className="hidden py-2 font-medium sm:table-cell">Time</th>
                    <th className="py-2 font-medium">Channel</th>
                    <th className="hidden py-2 font-medium sm:table-cell">Seller</th>
                    <th className="py-2 text-right font-medium">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2 font-medium tabular-nums">{o.name}</td>
                      <td className="text-muted-foreground hidden py-2 tabular-nums sm:table-cell">
                        {o.time}
                      </td>
                      <td className="py-2">
                        <ChannelBadge channel={o.channel} />
                      </td>
                      <td className="text-muted-foreground hidden py-2 sm:table-cell">
                        {o.seller ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {formatMoney(o.net, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="py-2" colSpan={4}>
                      {shown.length} order{shown.length === 1 ? "" : "s"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatMoney(
                        shown.reduce((s, o) => s + o.net, 0),
                        currency,
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
