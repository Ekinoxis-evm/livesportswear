import type { GoalPace } from "@/lib/goal-pace";
import { cn } from "@/lib/utils";

/**
 * A visual goal indicator: a progress ring (percent to goal) beside two hero
 * figures — what's LEFT to reach the goal, and the per-day pace needed over the
 * remaining days. Shared by portal, kiosk and admin so the goal reads the same
 * everywhere. Renders nothing when no goal is set.
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

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border p-4",
        reached
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "bg-muted/30",
        compact && "gap-3 p-3",
        className,
      )}
    >
      <Ring pct={pct} reached={reached} size={compact ? 52 : 64} />

      {reached ? (
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-emerald-600">
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
              value={`${format(pace.perDay)}`}
              tone="primary"
              big={!compact}
            />
          ) : (
            <Hero label="Time left" value="Month over" big={!compact} />
          )}
        </div>
      )}
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

/** A circular progress ring with the percent in the middle. Pure SVG. */
function Ring({
  pct,
  reached,
  size,
}: {
  pct: number;
  reached: boolean;
  size: number;
}) {
  const stroke = size < 60 ? 5 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      role="img"
      aria-label={`${Math.round(pct * 100)}% of goal`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-muted"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        className={reached ? "stroke-emerald-500" : "stroke-primary"}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className={cn(
          "rotate-90 fill-foreground font-semibold tabular-nums",
          size < 60 ? "text-[13px]" : "text-sm",
        )}
        style={{ transformOrigin: "center" }}
      >
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}
