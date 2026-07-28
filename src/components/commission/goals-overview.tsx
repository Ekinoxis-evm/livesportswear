import { formatMoney } from "@/lib/commission";
import { cn } from "@/lib/utils";
import type { StoreGoalLevels } from "@/lib/goal-levels";

/**
 * Read-out that ties the store goal, the personal goals and the commission
 * tiers together: each tier is a per-rep threshold, so × the team it's a store
 * LEVEL that unlocks a higher rate. Shows the coherence between the set store
 * goal, the sum of personal goals and the first level, so the admin can line
 * them up. Presentational — the numbers are computed by `storeGoalLevels`.
 */
export function GoalsOverview({
  data,
  currency,
  monthLabel,
}: {
  data: StoreGoalLevels;
  currency: string;
  monthLabel: string;
}) {
  const money = (n: number) => formatMoney(n, currency);
  if (data.levels.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Set commission tiers to see how each level maps to a store target.
      </p>
    );
  }

  const sumNote =
    data.personalSumVsGoal === "none"
      ? null
      : data.personalSumVsGoal === "match"
        ? { text: "matches the store goal", ok: true }
        : {
            text: `${money(Math.abs(data.personalGoalSum - data.storeGoal))} ${data.personalSumVsGoal} the store goal`,
            ok: false,
          };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary strip */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <Fig label="Store goal" value={data.storeGoal > 0 ? money(data.storeGoal) : "—"} />
        <Fig label="Personal goals (sum)" value={money(data.personalGoalSum)} />
        <Fig label="Active reps" value={String(data.activeReps)} />
      </div>

      {(sumNote || data.tierBelowPersonalGoal) && (
        <div className="flex flex-col gap-1 text-xs">
          {sumNote && (
            <span className={sumNote.ok ? "text-emerald-600" : "text-amber-600"}>
              {sumNote.ok ? "✓" : "⚠"} Personal goals {sumNote.text}.
            </span>
          )}
          {data.tierBelowPersonalGoal && (
            <span className="text-amber-600">
              ⚠ A commission tier sits below the personal goal — tiers should reward
              beating the goal.
            </span>
          )}
        </div>
      )}

      {/* Levels table — each tier as a store target */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-left">
              <th className="py-2 font-medium">Level</th>
              <th className="py-2 text-right font-medium">Per rep</th>
              <th className="py-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Store total (×{data.activeReps})</th>
              <th className="py-2 text-right font-medium">vs base</th>
            </tr>
          </thead>
          <tbody>
            {data.levels.map((l, i) => (
              <tr key={l.perRep} className="border-b last:border-0">
                <td className="py-2 font-medium">
                  {i === 0 ? "Base" : `Level ${i + 1}`}
                </td>
                <td className="py-2 text-right tabular-nums">{money(l.perRep)}</td>
                <td className="py-2 text-right tabular-nums">
                  {(l.rate * 100).toFixed(l.rate * 100 % 1 === 0 ? 0 : 1)}%
                </td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {money(l.storeTarget)}
                </td>
                <td
                  className={cn(
                    "py-2 text-right tabular-nums",
                    l.deltaVsBase > 0 ? "text-emerald-600" : "text-muted-foreground",
                  )}
                >
                  {l.deltaVsBase > 0
                    ? `+${money(l.deltaVsBase)} · +${Math.round((l.pctOfBase - 1) * 100)}%`
                    : "base"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted-foreground text-xs">
        {monthLabel}: if every rep reaches a tier, the store hits that level — the
        target rises with the commission rate.
      </p>
    </div>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
    </span>
  );
}
