import type { GoalPace } from "@/lib/goal-pace";
import { cn } from "@/lib/utils";

/**
 * One line summarising a rep's monthly goal pace: what's left and the per-day
 * average needed to reach it. Shared by portal, kiosk and admin so the message
 * reads the same everywhere. Renders nothing when no goal is set.
 */
export function GoalPaceLine({
  pace,
  format,
  className,
}: {
  pace: GoalPace;
  format: (n: number) => string;
  className?: string;
}) {
  if (pace.goal <= 0) return null;

  if (pace.reached) {
    return (
      <p className={cn("text-sm font-medium text-emerald-600", className)}>
        Goal reached — {format(pace.sold)} of {format(pace.goal)}.
      </p>
    );
  }

  return (
    <p className={cn("text-muted-foreground text-sm", className)}>
      <span className="text-foreground font-semibold tabular-nums">
        {format(pace.remaining)}
      </span>{" "}
      left to reach {format(pace.goal)}
      {pace.daysLeft > 0 ? (
        <>
          {" · "}
          <span className="text-foreground font-semibold tabular-nums">
            {format(pace.perDay)}/day
          </span>{" "}
          over the last {pace.daysLeft} day{pace.daysLeft === 1 ? "" : "s"}
        </>
      ) : (
        " · month is over"
      )}
    </p>
  );
}
