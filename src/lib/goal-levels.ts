import type { CommissionTier } from "@/lib/commission";

/**
 * Store-goal LEVELS derived from the commission tiers. Each commission tier is a
 * per-rep threshold; multiplied by the active team it becomes a store-level
 * target that unlocks that tier's rate — so the store goal rises with the
 * commission levels (5 reps × $11k = $55k, × $12k = $60k, …). The `$0` base tier
 * is the floor rate, not a target, so it's excluded from the ladder. Pure: no
 * DB, no clock.
 */

export type GoalLevel = {
  perRep: number; // the tier threshold, per employee
  rate: number; // the rate this level unlocks (fraction)
  storeTarget: number; // perRep × activeReps
  pctOfBase: number; // storeTarget / base (1 = the base level)
  deltaVsBase: number; // storeTarget − base
};

export type StoreGoalLevels = {
  levels: GoalLevel[]; // ascending; empty when no positive tiers
  base: number; // the first level's store target (the entry store goal)
  top: number; // the top level's store target (0 when no levels)
  activeReps: number;
  storeGoal: number; // the store's set goal (store_goals.goal_amount)
  personalGoalSum: number; // Σ personal goals for the active team
  // Coherence flags for the admin read-out:
  goalVsBase: "match" | "over" | "under" | "none"; // storeGoal vs first level
  personalSumVsGoal: "match" | "over" | "under" | "none"; // Σ personal vs storeGoal
  tierBelowPersonalGoal: boolean; // any tier threshold < the base personal goal
};

const EPS = 1; // treat sub-$1 gaps as "match" (rounding)

function compare(a: number, b: number): "match" | "over" | "under" {
  if (Math.abs(a - b) <= EPS) return "match";
  return a > b ? "over" : "under";
}

export function storeGoalLevels({
  tiers,
  activeReps,
  storeGoal,
  personalGoalSum,
  basePersonalGoal = 0,
}: {
  tiers: CommissionTier[];
  activeReps: number;
  storeGoal: number;
  personalGoalSum: number;
  /** The typical per-rep personal goal, to warn when a tier sits below it. */
  basePersonalGoal?: number;
}): StoreGoalLevels {
  const positive = [...tiers]
    .filter((t) => t.min_sales > 0)
    .sort((a, b) => a.min_sales - b.min_sales);

  const base = positive.length ? positive[0].min_sales * activeReps : 0;
  const levels: GoalLevel[] = positive.map((t) => {
    const storeTarget = t.min_sales * activeReps;
    return {
      perRep: t.min_sales,
      rate: t.rate,
      storeTarget,
      pctOfBase: base > 0 ? storeTarget / base : 0,
      deltaVsBase: storeTarget - base,
    };
  });

  return {
    levels,
    base,
    top: levels.length ? levels[levels.length - 1].storeTarget : 0,
    activeReps,
    storeGoal,
    personalGoalSum,
    goalVsBase: storeGoal > 0 && base > 0 ? compare(storeGoal, base) : "none",
    personalSumVsGoal:
      storeGoal > 0 && personalGoalSum > 0 ? compare(personalGoalSum, storeGoal) : "none",
    tierBelowPersonalGoal:
      basePersonalGoal > 0 && positive.some((t) => t.min_sales < basePersonalGoal - EPS),
  };
}
