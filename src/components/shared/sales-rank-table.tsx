import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/commission";
import { Badge } from "@/components/ui/badge";
import type { SalesRankRow } from "@/lib/sales-period";

/**
 * The standardized ranked employee-sales table: # · Employee (· Store) ·
 * Value · Discounts · Returns · Net, plus the optional per-surface column
 * groups (Goal %, Share %, or the monthly commission trio).
 */
export function SalesRankTable({
  rows,
  currency,
  showStore = false,
  showGoal = false,
  showShare = false,
  showCommission = false,
}: {
  rows: SalesRankRow[];
  currency: string;
  showStore?: boolean;
  showGoal?: boolean;
  showShare?: boolean;
  showCommission?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No sales to rank yet.</p>;
  }
  const th = "py-2 text-right font-medium";
  const money = (v: number) => formatMoney(v, currency);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left">
            <th className="py-2 font-medium">#</th>
            <th className="py-2 font-medium">Employee</th>
            {showStore && <th className="py-2 font-medium">Store</th>}
            <th className={th}>Value</th>
            <th className={th}>Discounts</th>
            <th className={th}>Returns</th>
            <th className={th}>Net</th>
            {showGoal && <th className={th}>Goal</th>}
            {showShare && <th className={th}>Share</th>}
            {showCommission && (
              <>
                <th className={th}>Rate</th>
                <th className={th}>Commission</th>
                <th className={th}>To next tier</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name + i} className="border-b last:border-0">
              <td className="text-muted-foreground py-2 tabular-nums">{i + 1}</td>
              <td className="py-2 font-medium">{r.name}</td>
              {showStore && (
                <td className="text-muted-foreground py-2">{r.store ?? "—"}</td>
              )}
              <td className="text-muted-foreground py-2 text-right tabular-nums">
                {r.breakdown ? money(r.breakdown.gross) : "—"}
              </td>
              <td className="text-muted-foreground py-2 text-right tabular-nums">
                {r.breakdown && r.breakdown.discounts > 0
                  ? `−${money(r.breakdown.discounts)}`
                  : "—"}
              </td>
              <td className="text-muted-foreground py-2 text-right tabular-nums">
                {r.breakdown && r.breakdown.returns > 0
                  ? `−${money(r.breakdown.returns)}`
                  : "—"}
              </td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {money(r.net)}
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
    </div>
  );
}
