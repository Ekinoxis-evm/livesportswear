import { formatMoney } from "@/lib/commission";
import { cn } from "@/lib/utils";
import type { GoalLevel } from "@/lib/goal-levels";

/**
 * The store goal as LEVELS: a bar scaled to the top level (top commission tier ×
 * the team), with a milestone per level and the current store sales filling
 * toward it. The target rises with the commission rate — hitting a higher level
 * unlocks a higher rate. CSS-only, theme-aware. Renders nothing without levels.
 */
export function GoalLevelsBar({
  levels,
  current,
  currency,
  className,
}: {
  levels: GoalLevel[];
  current: number;
  currency: string;
  className?: string;
}) {
  const money = (n: number) => formatMoney(n, currency);
  const max = levels.length ? levels[levels.length - 1].storeTarget : 0;
  if (max <= 0) return null;

  const fillPct = Math.min(Math.max(current / max, 0), 1) * 100;
  // Highest level reached, and the next one to chase.
  let reachedIdx = -1;
  for (let i = 0; i < levels.length; i++) if (current >= levels[i].storeTarget) reachedIdx = i;
  const next = reachedIdx + 1 < levels.length ? levels[reachedIdx + 1] : null;
  const rateLabel = (r: number) => `${(r * 100).toFixed((r * 100) % 1 === 0 ? 0 : 1)}%`;
  const levelName = (i: number) => (i === 0 ? "Base" : `Level ${i + 1}`);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
        <span>
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            Store sales
          </span>{" "}
          <span className="font-bold tabular-nums">{money(current)}</span>
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {reachedIdx >= 0
            ? `${levelName(reachedIdx)} reached · ${rateLabel(levels[reachedIdx].rate)}`
            : "Below the first level"}
          {next && ` · ${money(next.storeTarget - current)} to ${rateLabel(next.rate)}`}
        </span>
      </div>

      {/* Bar scaled to the top level, with a tick per level. */}
      <div className="bg-muted relative h-3 w-full overflow-hidden rounded-full">
        <div className="bg-primary absolute inset-y-0 left-0" style={{ width: `${fillPct}%` }} />
        {levels.slice(0, -1).map((l) => (
          <div
            key={l.perRep}
            aria-hidden
            className="bg-background/70 absolute inset-y-0 w-0.5"
            style={{ left: `${(l.storeTarget / max) * 100}%` }}
          />
        ))}
      </div>

      {/* Level legend — reached ones highlighted. */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {levels.map((l, i) => (
          <span
            key={l.perRep}
            className={cn(
              "rounded-full border px-2 py-0.5 tabular-nums",
              i <= reachedIdx
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "text-muted-foreground",
            )}
          >
            {levelName(i)} {money(l.storeTarget)} · {rateLabel(l.rate)}
          </span>
        ))}
      </div>
    </div>
  );
}
