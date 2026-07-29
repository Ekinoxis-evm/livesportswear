/**
 * Render model for the unified goal meter: ONE bar that shows progress toward a
 * goal with the commission LEVELS (or tiers) marked along it, the current rate,
 * and — for the tap/hover detail — how much more and per day to the next level.
 *
 * Replaces the three stacked visuals (goal bar + fill-card + levels bar). Pure:
 * no DB, no clock. Callers pass `current` sales, the `milestones` (store levels
 * or per-rep tiers), the optional set `goalValue`, and `paceDays` (calendar days
 * left for the store, workable days left for a person — from `goalPace`).
 */

export type MeterMilestone = { value: number; label: string; rate?: number };

export type MeterTick = {
  value: number;
  label: string;
  rate: number | null;
  reached: boolean;
  leftPct: number; // 0..100 position along the bar
};

export type MeterNext = {
  label: string;
  value: number;
  rate: number | null;
  remaining: number; // value − current
  perDay: number | null; // remaining / paceDays (null when no days left)
  isGoal: boolean; // the next marker is the set goal, not a level
};

export type GoalMeterModel = {
  current: number;
  top: number; // bar scale = the furthest marker
  fillPct: number; // 0..100 — current along the bar
  pct: number; // 0..1 toward the goal (goalValue ?? first milestone)
  reachedGoal: boolean;
  currentRate: number | null; // highest reached milestone's rate
  ticks: MeterTick[]; // milestone markers, ascending
  goal: { value: number; leftPct: number; reached: boolean; separate: boolean } | null;
  next: MeterNext | null; // nearest marker above `current`
  workBasis: boolean; // paceDays are workable days (person), not calendar
  paceDays: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const clampPct = (frac: number) => Math.min(Math.max(frac, 0), 1) * 100;

export function buildGoalMeter({
  current,
  milestones,
  goalValue = null,
  paceDays,
  workBasis = false,
}: {
  current: number;
  milestones: MeterMilestone[];
  goalValue?: number | null;
  paceDays: number;
  workBasis?: boolean;
}): GoalMeterModel | null {
  const sorted = milestones
    .filter((m) => m.value > 0)
    .sort((a, b) => a.value - b.value);
  const hasGoal = goalValue != null && goalValue > 0;
  const top = Math.max(0, ...sorted.map((m) => m.value), hasGoal ? goalValue : 0);
  if (top <= 0) return null;

  const ticks: MeterTick[] = sorted.map((m) => ({
    value: m.value,
    label: m.label,
    rate: m.rate ?? null,
    reached: current >= m.value,
    leftPct: clampPct(m.value / top),
  }));

  // The "goal" for the headline percent: the set goal, else the first level.
  const goalTarget = hasGoal ? goalValue : (sorted[0]?.value ?? 0);
  const reachedGoal = goalTarget > 0 && current >= goalTarget;

  let currentRate: number | null = null;
  for (const t of ticks) if (t.reached && t.rate != null) currentRate = t.rate;

  // Markers for the "next target": the levels, plus the set goal when it doesn't
  // land on a level. `next` is the nearest one still above the current sales.
  const separate = hasGoal && !sorted.some((m) => Math.abs(m.value - goalValue) < 1);
  const markers = sorted.map((m) => ({ value: m.value, label: m.label, rate: m.rate ?? null, isGoal: false }));
  if (separate) markers.push({ value: goalValue, label: "Goal", rate: null, isGoal: true });
  markers.sort((a, b) => a.value - b.value);
  const nm = markers.find((m) => m.value > current + 0.5) ?? null;
  const next: MeterNext | null = nm
    ? {
        label: nm.label,
        value: nm.value,
        rate: nm.rate,
        remaining: round2(nm.value - current),
        perDay: paceDays > 0 ? round2((nm.value - current) / paceDays) : null,
        isGoal: nm.isGoal,
      }
    : null;

  return {
    current: round2(current),
    top,
    fillPct: clampPct(current / top),
    pct: goalTarget > 0 ? current / goalTarget : 0,
    reachedGoal,
    currentRate,
    ticks,
    goal: hasGoal
      ? { value: goalValue, leftPct: clampPct(goalValue / top), reached: current >= goalValue, separate }
      : null,
    next,
    workBasis,
    paceDays,
  };
}
