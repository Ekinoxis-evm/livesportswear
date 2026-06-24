/**
 * Commission tiers. Pure. `rate` is a fraction (0.04 = 4%). Tiers ascend by
 * `min_sales`; the employee's rate is the highest tier they've reached. The
 * "goal" is simply the next tier above their current sales.
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
  let rate = 0;
  for (const tier of sorted) {
    if (sales >= tier.min_sales) rate = tier.rate;
  }
  const next = sorted.find((t) => t.min_sales > sales) ?? null;
  return {
    rate,
    earned: Math.round(sales * rate * 100) / 100,
    nextTier: next
      ? { min_sales: next.min_sales, rate: next.rate, remaining: next.min_sales - sales }
      : null,
  };
}

export function formatMoney(amount: number, currency = "COP"): string {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return amount.toLocaleString();
  }
}
