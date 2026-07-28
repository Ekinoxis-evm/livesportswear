import { describe, expect, it } from "vitest";
import { storeGoalLevels } from "@/lib/goal-levels";

const tiers = [
  { min_sales: 0, rate: 0.04 },
  { min_sales: 10_000, rate: 0.045 },
  { min_sales: 11_000, rate: 0.055 },
  { min_sales: 12_000, rate: 0.06 },
];

describe("storeGoalLevels", () => {
  it("turns each positive tier into a store level = perRep × activeReps", () => {
    const r = storeGoalLevels({ tiers, activeReps: 5, storeGoal: 50_000, personalGoalSum: 50_000 });
    expect(r.levels.map((l) => [l.perRep, l.storeTarget, l.deltaVsBase])).toEqual([
      [10_000, 50_000, 0],
      [11_000, 55_000, 5_000],
      [12_000, 60_000, 10_000],
    ]);
    expect(r.levels.map((l) => Math.round(l.pctOfBase * 100))).toEqual([100, 110, 120]);
    expect(r.base).toBe(50_000);
    expect(r.top).toBe(60_000);
  });

  it("excludes the $0 base tier from the ladder", () => {
    const r = storeGoalLevels({ tiers, activeReps: 3, storeGoal: 30_000, personalGoalSum: 30_000 });
    expect(r.levels).toHaveLength(3); // 3 positive tiers, not 4
    expect(r.levels[0].rate).toBe(0.045);
  });

  it("flags store goal vs the first level (match / over / under)", () => {
    expect(storeGoalLevels({ tiers, activeReps: 5, storeGoal: 50_000, personalGoalSum: 50_000 }).goalVsBase).toBe("match");
    expect(storeGoalLevels({ tiers, activeReps: 5, storeGoal: 45_000, personalGoalSum: 45_000 }).goalVsBase).toBe("under");
    expect(storeGoalLevels({ tiers, activeReps: 5, storeGoal: 60_000, personalGoalSum: 60_000 }).goalVsBase).toBe("over");
  });

  it("flags the sum of personal goals vs the store goal", () => {
    expect(storeGoalLevels({ tiers, activeReps: 5, storeGoal: 50_000, personalGoalSum: 48_000 }).personalSumVsGoal).toBe("under");
    expect(storeGoalLevels({ tiers, activeReps: 5, storeGoal: 50_000, personalGoalSum: 50_000 }).personalSumVsGoal).toBe("match");
  });

  it("warns when a tier threshold sits below the base personal goal", () => {
    expect(
      storeGoalLevels({ tiers, activeReps: 5, storeGoal: 50_000, personalGoalSum: 50_000, basePersonalGoal: 10_000 }).tierBelowPersonalGoal,
    ).toBe(false);
    expect(
      storeGoalLevels({ tiers, activeReps: 5, storeGoal: 50_000, personalGoalSum: 50_000, basePersonalGoal: 12_500 }).tierBelowPersonalGoal,
    ).toBe(true); // $10k and $11k tiers are below a $12.5k personal goal
  });

  it("is empty with no positive tiers", () => {
    const r = storeGoalLevels({ tiers: [{ min_sales: 0, rate: 0.04 }], activeReps: 5, storeGoal: 0, personalGoalSum: 0 });
    expect(r.levels).toEqual([]);
    expect(r.top).toBe(0);
    expect(r.goalVsBase).toBe("none");
  });
});
