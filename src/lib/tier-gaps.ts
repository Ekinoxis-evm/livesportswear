import { commissionFor, type CommissionTier } from "@/lib/commission";

/**
 * How far a rep's month sales are from each commission tier — the ladder shown
 * on the portal + kiosk Performance. Each row is a configured tier threshold
 * with how much more is needed to reach it (and, when workdays are known, the
 * per-remaining-workday pace). Pure: no DB, no clock. `currentRate` is the rate
 * the rep is actually earning now (via the band-aware `commissionFor`).
 */

export type TierGap = {
  min_sales: number;
  rate: number;
  reached: boolean;
  remaining: number; // 0 once reached
  perDay: number | null; // remaining / workdays left, when known and > 0
};

export type TierGaps = {
  tiers: TierGap[];
  currentRate: number;
};

export function tierGaps(
  sales: number,
  tiers: CommissionTier[],
  opts: { workDaysLeft?: number } = {},
): TierGaps {
  const wd = opts.workDaysLeft;
  const rows: TierGap[] = [...tiers]
    .sort((a, b) => a.min_sales - b.min_sales)
    .map((t) => {
      const remaining = Math.max(0, t.min_sales - sales);
      return {
        min_sales: t.min_sales,
        rate: t.rate,
        reached: sales >= t.min_sales,
        remaining,
        perDay: remaining > 0 && wd && wd > 0 ? remaining / wd : null,
      };
    });
  return { tiers: rows, currentRate: commissionFor(sales, tiers).rate };
}
