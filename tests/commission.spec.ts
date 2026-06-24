import { describe, it, expect } from "vitest";
import { commissionFor, formatMoney } from "@/lib/commission";

const TIERS = [
  { min_sales: 0, rate: 0.04 },
  { min_sales: 20_000_000, rate: 0.045 },
  { min_sales: 35_000_000, rate: 0.06 },
];

describe("commissionFor", () => {
  it("applies the base rate below the goal and points at the next tier", () => {
    const r = commissionFor(10_000_000, TIERS);
    expect(r.rate).toBe(0.04);
    expect(r.earned).toBe(400_000);
    expect(r.nextTier).toEqual({
      min_sales: 20_000_000,
      rate: 0.045,
      remaining: 10_000_000,
    });
  });

  it("unlocks the goal rate exactly at the threshold", () => {
    const r = commissionFor(20_000_000, TIERS);
    expect(r.rate).toBe(0.045);
    expect(r.nextTier?.min_sales).toBe(35_000_000);
  });

  it("applies the top rate with no next tier above the stretch", () => {
    const r = commissionFor(40_000_000, TIERS);
    expect(r.rate).toBe(0.06);
    expect(r.earned).toBe(2_400_000);
    expect(r.nextTier).toBeNull();
  });

  it("sorts unordered tiers and handles empty tiers", () => {
    expect(commissionFor(50, [...TIERS].reverse()).rate).toBe(0.04);
    expect(commissionFor(1000, [])).toEqual({
      rate: 0,
      earned: 0,
      nextTier: null,
    });
  });
});

describe("formatMoney", () => {
  it("formats a COP amount as a non-empty string", () => {
    expect(formatMoney(1_500_000)).toMatch(/1.?500.?000/);
  });
  it("falls back when the currency code is invalid", () => {
    expect(formatMoney(1000, "not-a-currency")).toBe((1000).toLocaleString());
  });
});
