/**
 * Commission tiers. Pure. `rate` is a fraction (0.04 = 4%). Thresholds are
 * band boundaries: the first rate applies below the first threshold, the
 * second between the first and second, and so on; the top rate keeps applying
 * beyond the last threshold. (`min_sales` is the stored jsonb field name —
 * semantically it's the band's upper boundary.) The "goal" is the next
 * boundary that unlocks a better rate.
 */
export type CommissionTier = { min_sales: number; rate: number };

export type CommissionResult = {
  rate: number;
  earned: number;
  nextTier: { min_sales: number; rate: number; remaining: number } | null;
};

export function commissionFor(
  sales: number,
  tiers: CommissionTier[],
): CommissionResult {
  const sorted = [...tiers].sort((a, b) => a.min_sales - b.min_sales);
  if (sorted.length === 0) return { rate: 0, earned: 0, nextTier: null };

  const band = sorted.findIndex((t) => sales < t.min_sales);
  const idx = band === -1 ? sorted.length - 1 : band;
  const rate = sorted[idx].rate;
  const next =
    band !== -1 && idx + 1 < sorted.length
      ? {
          min_sales: sorted[idx].min_sales,
          rate: sorted[idx + 1].rate,
          remaining: sorted[idx].min_sales - sales,
        }
      : null;
  return {
    rate,
    earned: Math.round(sales * rate * 100) / 100,
    nextTier: next,
  };
}

export function formatMoney(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return amount.toLocaleString();
  }
}

/** Currency with cents — used where precise amounts matter (the daily report). */
export function formatMoneyExact(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2);
  }
}

/** Coerce a jsonb value into a tier array (invalid entries dropped). */
export function asTiers(value: unknown): CommissionTier[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (t): t is CommissionTier =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as CommissionTier).min_sales === "number" &&
      typeof (t as CommissionTier).rate === "number",
  );
}

/** A store/month's own tiers if set, else the global fallback. */
export function resolveTiers(
  storeTiers: unknown,
  globalTiers: CommissionTier[],
): CommissionTier[] {
  const own = asTiers(storeTiers);
  return own.length > 0 ? own : globalTiers;
}
