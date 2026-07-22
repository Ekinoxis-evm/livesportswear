import { describe, it, expect } from "vitest";
import { commissionFor, formatMoney } from "@/lib/commission";

const TIERS = [
  { min_sales: 10_000, rate: 0.04 },
  { min_sales: 11_000, rate: 0.045 },
  { min_sales: 12_000, rate: 0.06 },
];

describe("commissionFor", () => {
  it("applies the first rate below the first threshold", () => {
    const r = commissionFor(9_000, TIERS);
    expect(r.rate).toBe(0.04);
    expect(r.earned).toBe(360);
    expect(r.nextTier).toEqual({
      min_sales: 10_000,
      rate: 0.045,
      remaining: 1_000,
    });
  });

  it("moves to the second band exactly at the first threshold", () => {
    const r = commissionFor(10_000, TIERS);
    expect(r.rate).toBe(0.045);
    expect(r.nextTier).toEqual({
      min_sales: 11_000,
      rate: 0.06,
      remaining: 1_000,
    });
  });

  it("applies the top rate in the last band with no next tier", () => {
    const r = commissionFor(11_500, TIERS);
    expect(r.rate).toBe(0.06);
    expect(r.earned).toBe(690);
    expect(r.nextTier).toBeNull();
  });

  it("keeps the top rate beyond the last threshold", () => {
    const r = commissionFor(40_000, TIERS);
    expect(r.rate).toBe(0.06);
    expect(r.earned).toBe(2_400);
    expect(r.nextTier).toBeNull();
  });

  it("sorts unordered tiers and handles empty tiers", () => {
    expect(commissionFor(9_500, [...TIERS].reverse()).rate).toBe(0.04);
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
    expect(formatMoney(1000, "not-a-currency")).toBe("1000.00");
  });
});
