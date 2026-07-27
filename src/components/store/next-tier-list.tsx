import { commissionFor, formatMoney, type CommissionTier } from "@/lib/commission";

/**
 * Per-rep "to next tier" on the kiosk month view: each rep with sales, their
 * current rate, and how much more they need to unlock the next rate (or a note
 * that they're at the top). The full per-tier ladder lives on the portal
 * (a rep's own); this is the shared-screen glance for everyone.
 */
export function NextTierList({
  rows,
  tiers,
  currency = "USD",
}: {
  rows: { name: string; net: number }[];
  tiers: CommissionTier[];
  currency?: string;
}) {
  if (tiers.length === 0 || rows.length === 0) return null;
  const ranked = [...rows].sort((a, b) => b.net - a.net);

  return (
    <ul className="flex flex-col gap-1.5">
      {ranked.map((r) => {
        const c = commissionFor(r.net, tiers);
        return (
          <li
            key={r.name}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-md border px-3 py-2 text-sm"
          >
            <span className="font-medium">
              {r.name}
              <span className="text-muted-foreground ml-2 text-xs tabular-nums">
                {formatMoney(r.net, currency)} · {(c.rate * 100).toFixed(c.rate * 100 % 1 === 0 ? 0 : 1)}%
              </span>
            </span>
            {c.nextTier ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatMoney(c.nextTier.remaining, currency)} to {(c.nextTier.rate * 100).toFixed(c.nextTier.rate * 100 % 1 === 0 ? 0 : 1)}%
              </span>
            ) : (
              <span className="text-xs font-medium text-emerald-600">top tier</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
