import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/commission";
import type { GoalMeterModel } from "@/lib/goal-meter";

/**
 * One goal meter, replacing the old goal bar + fill-card + levels bar. A single
 * progress bar 0 → top level: the fill turns green once the goal is reached, a
 * tick marks each level. Under the bar, always on: the "$X more · $Y/day → next
 * level" line, then the level list with each tier's target + rate (reached ones
 * ticked, the next highlighted) — laid out as tidy rows rather than crowded
 * around the bar. Model is pure (`buildGoalMeter`). Renders nothing without a
 * goal/levels.
 */
export function GoalMeter({
  model,
  currency,
  title,
  compact = false,
  className,
}: {
  model: GoalMeterModel | null;
  /** A string, not a formatter — kept serializable so a server page can pass it. */
  currency: string;
  title?: string;
  /** Slim bar + a one-line to-go summary (for dense admin rows). */
  compact?: boolean;
  className?: string;
}) {
  if (!model) return null;

  const format = (n: number) => formatMoney(n, currency);
  const pctLabel = Math.round(Math.min(Math.max(model.pct, 0), 1) * 100);
  const rate = (r: number) => `${(r * 100).toFixed((r * 100) % 1 === 0 ? 0 : 1)}%`;
  // A per-rep tier's label IS its rate; don't print the rate twice.
  const rateSuffix = (label: string, r: number | null) =>
    r != null && label !== rate(r) ? ` (${rate(r)})` : "";
  const perDayUnit = model.workBasis ? "work day" : "day";
  const reached = model.reachedGoal;
  const firstUnreached = model.ticks.find((t) => !t.reached) ?? null;

  const toGoLine = model.next ? (
    <p className="text-sm">
      <span className="text-primary font-semibold tabular-nums">{format(model.next.remaining)}</span>
      <span className="text-muted-foreground"> more</span>
      {model.next.perDay != null && (
        <>
          <span className="text-muted-foreground"> · </span>
          <span className="font-semibold tabular-nums">{format(model.next.perDay)}</span>
          <span className="text-muted-foreground">/{perDayUnit}</span>
        </>
      )}
      <span className="text-muted-foreground">
        {" → "}
        {model.next.label}
        {rateSuffix(model.next.label, model.next.rate)}
      </span>
    </p>
  ) : (
    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
      Top level reached 🎉
    </p>
  );

  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2.5", className)}>
      {!compact && (
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            {title && (
              <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                {title}
              </span>
            )}
            <span className="text-2xl font-bold tabular-nums leading-tight">
              {format(model.current)}
            </span>
          </div>
          <span
            className={cn(
              "text-3xl font-bold tabular-nums leading-none",
              reached ? "text-emerald-600 dark:text-emerald-400" : "text-primary",
            )}
          >
            {pctLabel}%
          </span>
        </div>
      )}

      <div
        className={cn(
          "bg-muted relative w-full overflow-hidden rounded-full",
          compact ? "h-2.5" : "h-3.5",
        )}
        role="progressbar"
        aria-valuenow={pctLabel}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-[width]",
            reached ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${model.fillPct}%` }}
        />
        {model.ticks.slice(0, -1).map((t) => (
          <span
            key={t.value}
            aria-hidden
            className="bg-background/70 absolute inset-y-0 w-0.5"
            style={{ left: `${t.leftPct}%` }}
          />
        ))}
        {model.goal?.separate && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-0.5 bg-amber-500"
            style={{ left: `${model.goal.leftPct}%` }}
          />
        )}
      </div>

      {/* Always on: the next target + per-day, then the tier numbers as rows. */}
      {compact ? (
        model.next && (
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {format(model.next.remaining)} to go
            {model.next.perDay != null && ` · ${format(model.next.perDay)}/${perDayUnit}`}
          </p>
        )
      ) : (
        <>
          {toGoLine}
          {model.ticks.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs">
              {model.ticks.map((t) => {
                const isNext = firstUnreached != null && t.value === firstUnreached.value;
                return (
                  <li
                    key={t.value}
                    className={cn(
                      "flex items-center justify-between gap-3 tabular-nums",
                      isNext && "font-medium",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {t.reached ? (
                        <Check className="size-3.5 text-emerald-600" />
                      ) : isNext ? (
                        <span className="text-primary size-3.5 text-center leading-none">→</span>
                      ) : (
                        <span className="text-muted-foreground/40 size-3.5 text-center leading-none">·</span>
                      )}
                      <span
                        className={cn(
                          t.reached
                            ? "text-emerald-700 dark:text-emerald-400"
                            : isNext
                              ? ""
                              : "text-muted-foreground",
                        )}
                      >
                        {t.label || (t.rate != null ? rate(t.rate) : "")}
                      </span>
                      {t.label && t.rate != null && (
                        <span className="text-muted-foreground">{rate(t.rate)}</span>
                      )}
                    </span>
                    <span
                      className={cn(t.reached || isNext ? "" : "text-muted-foreground")}
                    >
                      {format(t.value)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
