import { describe, expect, it } from "vitest";
import { buildGoalMeter, type MeterMilestone } from "@/lib/goal-meter";

const levels: MeterMilestone[] = [
  { value: 50000, label: "Base", rate: 0.045 },
  { value: 55000, label: "Level 2", rate: 0.055 },
  { value: 60000, label: "Level 3", rate: 0.06 },
];

describe("buildGoalMeter", () => {
  it("returns null when there is nothing to scale to", () => {
    expect(buildGoalMeter({ current: 0, milestones: [], paceDays: 10 })).toBeNull();
    expect(
      buildGoalMeter({ current: 100, milestones: [{ value: 0, label: "x" }], paceDays: 10 }),
    ).toBeNull();
  });

  it("scales the bar to the furthest marker and fills to current", () => {
    const m = buildGoalMeter({ current: 42000, milestones: levels, paceDays: 10 })!;
    expect(m.top).toBe(60000);
    expect(m.fillPct).toBeCloseTo(70, 5);
    expect(m.ticks.map((t) => t.leftPct)).toEqual([
      (50000 / 60000) * 100,
      (55000 / 60000) * 100,
      100,
    ]);
  });

  it("marks reached milestones and the current rate is the highest reached", () => {
    const m = buildGoalMeter({ current: 56000, milestones: levels, paceDays: 10 })!;
    expect(m.ticks.map((t) => t.reached)).toEqual([true, true, false]);
    expect(m.currentRate).toBe(0.055); // reached Level 2, not yet Level 3
  });

  it("points `next` at the nearest unreached level with remaining + per-day", () => {
    const m = buildGoalMeter({ current: 52000, milestones: levels, paceDays: 10 })!;
    expect(m.next).toMatchObject({ label: "Level 2", value: 55000, rate: 0.055, isGoal: false });
    expect(m.next!.remaining).toBe(3000);
    expect(m.next!.perDay).toBe(300); // 3000 / 10
  });

  it("has no `next` and no per-day once every level is passed", () => {
    const m = buildGoalMeter({ current: 61000, milestones: levels, paceDays: 10 })!;
    expect(m.next).toBeNull();
    expect(m.fillPct).toBe(100);
  });

  it("treats a distinct set goal as its own marker and next target", () => {
    // Goal $52k sits between Base and Level 2, so it's the nearest target.
    const m = buildGoalMeter({ current: 50500, milestones: levels, goalValue: 52000, paceDays: 8 })!;
    expect(m.goal).toMatchObject({ value: 52000, reached: false, separate: true });
    expect(m.next).toMatchObject({ label: "Goal", isGoal: true, remaining: 1500 });
    expect(m.reachedGoal).toBe(false);
    expect(m.pct).toBeCloseTo(50500 / 52000, 5);
  });

  it("does not duplicate a goal that coincides with a level", () => {
    const m = buildGoalMeter({ current: 40000, milestones: levels, goalValue: 50000, paceDays: 10 })!;
    expect(m.goal!.separate).toBe(false);
    expect(m.next).toMatchObject({ label: "Base", isGoal: false });
  });

  it("supports a single goal with no levels (plain bar)", () => {
    const m = buildGoalMeter({ current: 3000, milestones: [], goalValue: 4000, paceDays: 5, workBasis: true })!;
    expect(m.top).toBe(4000);
    expect(m.ticks).toEqual([]);
    expect(m.reachedGoal).toBe(false);
    expect(m.next).toMatchObject({ label: "Goal", remaining: 1000, perDay: 200, isGoal: true });
    expect(m.workBasis).toBe(true);
  });

  it("reports reachedGoal and no per-day when the goal is met", () => {
    const m = buildGoalMeter({ current: 4200, milestones: [], goalValue: 4000, paceDays: 5 })!;
    expect(m.reachedGoal).toBe(true);
    expect(m.next).toBeNull();
  });

  it("yields null per-day when no days remain but keeps the remaining amount", () => {
    const m = buildGoalMeter({ current: 52000, milestones: levels, paceDays: 0 })!;
    expect(m.next!.remaining).toBe(3000);
    expect(m.next!.perDay).toBeNull();
  });
});
