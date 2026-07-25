import type { GoalPace } from "@/lib/goal-pace";
import { cn } from "@/lib/utils";

/**
 * A visual goal indicator: the whole card is a progress bar. The goal colour
 * fills the background from the left up to the percent reached, with the two
 * hero figures — what's LEFT to reach the goal and the per-day pace over the
 * remaining days — and the percent sitting on top. Shared by portal, kiosk and
 * admin so the goal reads the same everywhere. Renders nothing when no goal is
 * set.
 */
export function GoalIndicator({
  pace,
  format,
  className,
  compact = false,
}: {
  pace: GoalPace;
  format: (n: number) => string;
  className?: string;
  /** Tighter layout for dense admin rows. */
  compact?: boolean;
}) {
  if (pace.goal <= 0) return null;

  const pct = Math.min(Math.max(pace.pct, 0), 1);
  const reached = pace.reached;
  const pctLabel = Math.round(pct * 100);
  // A sliver always shows so an empty goal still reads as a bar, not a blank.
  const fillWidth = reached ? 100 : Math.max(pct * 100, 3);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border",
        reached ? "border-emerald-500/50" : "border-border",
        className,
      )}
      role="img"
      aria-label={`${pctLabel}% of goal`}
    >
      {/* The fill: the goal colour as a background rising to the percent. */}
      <div
        className={cn(
          "absolute inset-y-0 left-0",
          reached ? "bg-emerald-500/25" : "bg-primary/20",
        )}
        style={{ width: `${fillWidth}%` }}
      />
      {/* A hairline at the fill edge so the boundary reads crisply. */}
      {!reached && pct > 0 && pct < 1 && (
        <div
          className="bg-primary/60 absolute inset-y-0 w-px"
          style={{ left: `${pct * 100}%` }}
        />
      )}

      <div
        className={cn(
          "relative flex items-center justify-between gap-4 p-4",
          compact && "gap-3 p-3",
        )}
      >
        {reached ? (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Goal reached 🎉
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {format(pace.sold)} of {format(pace.goal)}
            </span>
          </div>
        ) : (
          <div className="flex flex-1 flex-wrap items-end gap-x-6 gap-y-2">
            <Hero
              label="Left to reach"
              value={format(pace.remaining)}
              big={!compact}
            />
            {pace.daysLeft > 0 ? (
              <Hero
                label={`Per day · ${pace.daysLeft} day${pace.daysLeft === 1 ? "" : "s"} left`}
                value={format(pace.perDay)}
                tone="primary"
                big={!compact}
              />
            ) : (
              <Hero label="Time left" value="Month over" big={!compact} />
            )}
          </div>
        )}

        <span
          className={cn(
            "shrink-0 font-bold tabular-nums leading-none",
            compact ? "text-xl" : "text-3xl",
            reached ? "text-emerald-600 dark:text-emerald-400" : "text-primary",
          )}
        >
          {pctLabel}%
        </span>
      </div>
    </div>
  );
}

function Hero({
  label,
  value,
  tone = "default",
  big,
}: {
  label: string;
  value: string;
  tone?: "default" | "primary";
  big: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
        {label}
      </span>
      <span
        className={cn(
          "font-bold tabular-nums leading-tight",
          big ? "text-2xl" : "text-xl",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </span>
    </div>
  );
}
