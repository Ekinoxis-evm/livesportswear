import { describe, expect, it } from "vitest";
import { goalPace } from "@/lib/goal-pace";

describe("goalPace", () => {
  it("computes the gap and the per-day pace to reach it", () => {
    // July has 31 days; on the 23rd there are 9 days left (incl. today).
    const p = goalPace(12000, 7600, "2026-07-23", "2026-07");
    expect(p.remaining).toBe(4400);
    expect(p.daysLeft).toBe(9);
    expect(p.perDay).toBe(round(4400 / 9));
    expect(p.reached).toBe(false);
  });

  it("is reached with zero remaining and zero pace once sold ≥ goal", () => {
    const p = goalPace(10000, 10500, "2026-07-10", "2026-07");
    expect(p.reached).toBe(true);
    expect(p.remaining).toBe(0);
    expect(p.perDay).toBe(0);
    expect(p.pct).toBeCloseTo(1.05);
  });

  it("counts today as a day still left (last day of month)", () => {
    const p = goalPace(1000, 0, "2026-07-31", "2026-07");
    expect(p.daysLeft).toBe(1);
    expect(p.perDay).toBe(1000);
  });

  it("treats a past month as over — no days left, no pace", () => {
    const p = goalPace(1000, 400, "2026-08-02", "2026-07");
    expect(p.daysLeft).toBe(0);
    expect(p.perDay).toBe(0);
    expect(p.remaining).toBe(600); // the gap is still real, just no time left
  });

  it("gives the whole month when today is before it", () => {
    const p = goalPace(3000, 0, "2026-06-15", "2026-07");
    expect(p.daysLeft).toBe(31);
  });

  it("no goal set → zeros, never divides by zero", () => {
    const p = goalPace(0, 500, "2026-07-15", "2026-07");
    expect(p).toMatchObject({ goal: 0, remaining: 0, reached: false, pct: 0, perDay: 0 });
  });

  it("handles February leap-year length", () => {
    const p = goalPace(2900, 0, "2024-02-01", "2024-02");
    expect(p.daysLeft).toBe(29);
    expect(p.perDay).toBe(round(2900 / 29));
  });
});

const round = (n: number) => Math.round(n * 100) / 100;
