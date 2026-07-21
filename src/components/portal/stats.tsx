import { cn } from "@/lib/utils";

/** The portal's one number-with-a-label primitive; every metric card uses it. */
export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </div>
  );
}

export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3", className)}>
      {children}
    </div>
  );
}

/** Progress toward a money goal — reached turns emerald, matching the kiosk. */
export function GoalBar({
  label,
  value,
  goal,
  format,
}: {
  label: string;
  value: number;
  goal: number;
  format: (n: number) => string;
}) {
  if (goal <= 0) return null;
  const pct = value / goal;
  const reached = value >= goal;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {format(value)} / {format(goal)} ·{" "}
          <span className={cn("font-semibold", reached && "text-emerald-600")}>
            {Math.round(pct * 100)}%
          </span>
        </span>
      </div>
      <div
        className="bg-muted h-2.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={Math.min(Math.round(pct * 100), 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn("h-full", reached ? "bg-emerald-500" : "bg-primary")}
          style={{ width: `${Math.min(pct * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}
