/**
 * Commission tiers. Pure. `rate` is a fraction (0.04 = 4%). Each `min_sales` is
 * a threshold you must **reach** to unlock its rate ("reach $10k → 4.5%"): the
 * applicable rate is the highest tier whose `min_sales ≤ sales`, applied to the
 * FULL sales. Below every threshold the rate is 0 — UNLESS a `{min_sales: 0}`
 * tier is present, which acts as the base rate. The "goal" (`nextTier`) is the
 * next threshold that unlocks a better rate. (This matches the tier ladder,
 * which marks a tier `reached` at `sales ≥ min_sales`.)
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

  // The highest tier the rep has reached (min_sales ≤ sales); -1 if below all.
  let idx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sales >= sorted[i].min_sales) idx = i;
    else break;
  }
  const rate = idx === -1 ? 0 : sorted[idx].rate;

  // The next threshold to reach for a better rate.
  const nextIdx = idx + 1;
  const next =
    nextIdx < sorted.length
      ? {
          min_sales: sorted[nextIdx].min_sales,
          rate: sorted[nextIdx].rate,
          remaining: Math.round((sorted[nextIdx].min_sales - sales) * 100) / 100,
        }
      : null;

  return {
    rate,
    earned: Math.round(sales * rate * 100) / 100,
    nextTier: next,
  };
}

/**
 * Money, always to the cent. Sales here are per-order amounts that rarely land
 * on a whole dollar, and rounding them made totals look like they disagreed
 * with Shopify — the app's numbers have to reconcile against the register to
 * the cent.
 *
 * Chart axis ticks deliberately don't use this (they format compactly, e.g.
 * "$12K", in components/dashboard/sales-charts.tsx).
 */
export function formatMoney(amount: number, currency = "USD"): string {
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

/** Currency with cents — used where precise amounts matter (the daily report). */
/** @deprecated formatMoney is now exact to the cent; kept so the day-report
 * callers keep working. Prefer formatMoney. */
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
