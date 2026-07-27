import { describe, expect, it } from "vitest";
import { tierGaps } from "@/lib/tier-gaps";

const tiers = [
  { min_sales: 5000, rate: 0.04 },
  { min_sales: 10000, rate: 0.06 },
  { min_sales: 18000, rate: 0.08 },
];

describe("tierGaps", () => {
  it("marks reached tiers and computes the remaining for unreached ones", () => {
    const g = tierGaps(7660, tiers);
    expect(g.tiers.map((t) => [t.min_sales, t.reached, t.remaining])).toEqual([
      [5000, true, 0],
      [10000, false, 2340],
      [18000, false, 10340],
    ]);
  });

  it("computes a per-workday pace when workdays are given", () => {
    const g = tierGaps(7660, tiers, { workDaysLeft: 13 });
    expect(g.tiers[1].perDay).toBeCloseTo(2340 / 13);
    expect(g.tiers[0].perDay).toBeNull(); // reached → no pace
  });

  it("leaves perDay null without workdays or when none remain", () => {
    const g = tierGaps(7660, tiers);
    expect(g.tiers[1].perDay).toBeNull();
    const zero = tierGaps(7660, tiers, { workDaysLeft: 0 });
    expect(zero.tiers[1].perDay).toBeNull();
  });

  it("sorts tiers by threshold regardless of input order", () => {
    const g = tierGaps(0, [tiers[2], tiers[0], tiers[1]]);
    expect(g.tiers.map((t) => t.min_sales)).toEqual([5000, 10000, 18000]);
  });

  it("reports the band-aware current rate", () => {
    expect(tierGaps(3000, tiers).currentRate).toBe(0.04);
    expect(tierGaps(7660, tiers).currentRate).toBe(0.06);
  });

  it("is empty with no tiers", () => {
    expect(tierGaps(5000, []).tiers).toEqual([]);
  });
});
