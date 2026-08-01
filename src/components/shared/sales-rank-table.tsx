"use client";

import { cn } from "@/lib/utils";
import { ScrollTable } from "@/components/shared/scroll-table";
import { SortableTh } from "@/components/shared/sortable-header";
import { useTableSort } from "@/lib/use-table-sort";
import { formatMoney } from "@/lib/commission";
import { Badge } from "@/components/ui/badge";
import type { SalesRankRow } from "@/lib/sales-period";

/**
 * The standardized ranked employee-sales table with Shopify's exact labels:
 * # · Employee (· Store) · Gross · Discounts · Returns · Net sales · Taxes ·
 * Total, plus the optional per-surface column groups (Goal %, Share %, or the
 * monthly commission trio). Net stays the ranking key + the metric.
 */
export function SalesRankTable({
  rows,
  currency,
  showStore = false,
  showGoal = false,
  showShare = false,
  showCommission = false,
  density,
}: {
  rows: SalesRankRow[];
  currency: string;
  showStore?: boolean;
  showGoal?: boolean;
  showShare?: boolean;
  showCommission?: boolean;
  /** The kiosk passes `comfortable`; admin keeps the compact default. */
  density?: "compact" | "comfortable";
}) {
  // The incoming order IS the leaderboard rank (net desc). Freeze it so the "#"
  // column keeps meaning even after the viewer sorts by another column.
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const { rows: sorted, sort, onSort } = useTableSort(ranked, {
    rank: (r) => r.rank,
    name: (r) => r.name,
    store: (r) => r.store,
    value: (r) => r.breakdown?.gross ?? null,
    discounts: (r) => r.breakdown?.discounts ?? null,
    returns: (r) => r.breakdown?.returns ?? null,
    net: (r) => r.net,
    taxes: (r) => r.breakdown?.taxes ?? null,
    total: (r) => r.breakdown?.total ?? r.net,
    goal: (r) => r.goalPct,
    share: (r) => r.sharePct,
    rate: (r) => r.rate,
    commission: (r) => r.earned,
    tier: (r) => r.nextTierLabel,
  });

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No sales to rank yet.</p>;
  }
  const th = "py-2 text-right font-medium";
  const money = (v: number) => formatMoney(v, currency);
  const H = (key: string, label: string, className: string) => (
    <SortableTh sortKey={key} sort={sort} onSort={onSort} className={className}>
      {label}
    </SortableTh>
  );
  return (
    <ScrollTable density={density} maxHeight="28rem">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-left">
            {H("rank", "#", "py-2 font-medium")}
            {H("name", "Employee", "py-2 font-medium")}
            {showStore && H("store", "Store", "py-2 font-medium")}
            {H("value", "Gross", `${th} hidden sm:table-cell`)}
            {H("discounts", "Discounts", `${th} hidden md:table-cell`)}
            {H("returns", "Returns", `${th} hidden md:table-cell`)}
            {H("net", "Net sales", th)}
            {H("taxes", "Taxes", `${th} hidden lg:table-cell`)}
            {H("total", "Total", th)}
            {showGoal && H("goal", "Goal", th)}
            {showShare && H("share", "Share", th)}
            {showCommission && (
              <>
                {H("rate", "Rate", th)}
                {H("commission", "Commission", th)}
                {H("tier", "To next tier", th)}
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.name + i} className="border-b last:border-0">
              <td className="text-muted-foreground py-2 tabular-nums">{r.rank}</td>
              <td className="py-2 font-medium">{r.name}</td>
              {showStore && (
                <td className="text-muted-foreground py-2">{r.store ?? "—"}</td>
              )}
              <td className="text-muted-foreground hidden py-2 text-right tabular-nums sm:table-cell">
                {r.breakdown ? money(r.breakdown.gross) : "—"}
              </td>
              <td className="text-muted-foreground hidden py-2 text-right tabular-nums md:table-cell">
                {r.breakdown && r.breakdown.discounts > 0
                  ? `−${money(r.breakdown.discounts)}`
                  : "—"}
              </td>
              <td className="text-muted-foreground hidden py-2 text-right tabular-nums md:table-cell">
                {r.breakdown && r.breakdown.returns > 0
                  ? `−${money(r.breakdown.returns)}`
                  : "—"}
              </td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {money(r.net)}
              </td>
              <td className="text-muted-foreground hidden py-2 text-right tabular-nums lg:table-cell">
                {r.breakdown && r.breakdown.taxes > 0 ? `+${money(r.breakdown.taxes)}` : "—"}
              </td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {money(r.breakdown?.total ?? r.net)}
              </td>
              {showGoal && (
                <td
                  className={cn(
                    "py-2 text-right tabular-nums",
                    r.goalPct != null && r.goalPct >= 1
                      ? "font-semibold text-emerald-600"
                      : "text-muted-foreground",
                  )}
                >
                  {r.goalPct != null ? `${Math.round(r.goalPct * 100)}%` : "—"}
                </td>
              )}
              {showShare && (
                <td className="text-muted-foreground py-2 text-right tabular-nums">
                  {r.sharePct != null ? `${Math.round(r.sharePct * 100)}%` : "—"}
                </td>
              )}
              {showCommission && (
                <>
                  <td className="py-2 text-right">
                    {r.rate != null ? (
                      <Badge variant="secondary">{(r.rate * 100).toFixed(1)}%</Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {r.earned != null ? money(r.earned) : "—"}
                  </td>
                  <td className="text-muted-foreground py-2 text-right tabular-nums">
                    {r.nextTierLabel ?? "—"}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}
