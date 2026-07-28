import { describe, it, expect } from "vitest";
import { commissionFor, formatMoney } from "@/lib/commission";

// Reach a threshold to unlock its rate; a $0 row is the base rate below the
// first bonus tier. Canonical store ladder: base 4%, then 4.5/5.5/6.
const TIERS = [
  { min_sales: 0, rate: 0.04 },
  { min_sales: 10_000, rate: 0.045 },
  { min_sales: 11_000, rate: 0.055 },
  { min_sales: 12_000, rate: 0.06 },
];

describe("commissionFor — reach a threshold to unlock its rate", () => {
  it("pays the base ($0) rate below the first bonus tier", () => {
    const r = commissionFor(8_106.76, TIERS);
    expect(r.rate).toBe(0.04);
    expect(r.earned).toBe(324.27);
    expect(r.nextTier).toEqual({ min_sales: 10_000, rate: 0.045, remaining: 1_893.24 });
  });

  it("unlocks the tier's own rate at/above its threshold (not the next one)", () => {
    const r = commissionFor(10_939.4, TIERS);
    expect(r.rate).toBe(0.045); // reached $10k, not yet $11k
    expect(r.earned).toBe(492.27);
    expect(r.nextTier).toEqual({ min_sales: 11_000, rate: 0.055, remaining: 60.6 });
  });

  it("moves up exactly at a threshold", () => {
    expect(commissionFor(11_000, TIERS).rate).toBe(0.055);
    expect(commissionFor(11_553.95, TIERS).rate).toBe(0.055);
  });

  it("applies the top rate at/beyond the last threshold, no next tier", () => {
    const r = commissionFor(13_000, TIERS);
    expect(r.rate).toBe(0.06);
    expect(r.earned).toBe(780);
    expect(r.nextTier).toBeNull();
  });

  it("with NO $0 base tier, below the first threshold earns nothing", () => {
    const noBase = [
      { min_sales: 10_000, rate: 0.045 },
      { min_sales: 11_000, rate: 0.055 },
    ];
    const r = commissionFor(8_000, noBase);
    expect(r.rate).toBe(0);
    expect(r.earned).toBe(0);
    expect(r.nextTier).toEqual({ min_sales: 10_000, rate: 0.045, remaining: 2_000 });
  });

  it("sorts unordered tiers and handles empty tiers", () => {
    expect(commissionFor(10_500, [...TIERS].reverse()).rate).toBe(0.045);
    expect(commissionFor(1000, [])).toEqual({ rate: 0, earned: 0, nextTier: null });
  });
});

describe("formatMoney", () => {
  it("formats a COP amount as a non-empty string", () => {
    expect(formatMoney(1_500_000)).toMatch(/1.?500.?000/);
  });
  it("falls back when the currency code is invalid", () => {
    expect(formatMoney(1000, "not-a-currency")).toBe("1000.00");
  });
});
