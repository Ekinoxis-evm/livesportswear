import { Check } from "lucide-react";
import { formatMoney } from "@/lib/commission";
import { cn } from "@/lib/utils";
import type { TierGaps } from "@/lib/tier-gaps";

/**
 * The commission-tier ladder: each configured tier with its rate and either
 * "reached" or how much more is needed (and per-workday pace when known).
 * Reused on the portal (a rep's own) and the kiosk (per rep). Theme-aware.
 */
export function TierLadder({
  gaps,
  currency = "USD",
}: {
  gaps: TierGaps;
  currency?: string;
}) {
  if (gaps.tiers.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {gaps.tiers.map((t) => (
        <li
          key={t.min_sales}
          className={cn(
            "flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-md border px-3 py-2 text-sm",
            t.reached && "border-emerald-500/40 bg-emerald-500/5",
          )}
        >
          <span className="flex items-center gap-2 font-medium tabular-nums">
            {formatMoney(t.min_sales, currency)}
            <span className="text-muted-foreground text-xs font-normal">
              {(t.rate * 100).toFixed(t.rate * 100 % 1 === 0 ? 0 : 1)}%
            </span>
          </span>
          {t.reached ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <Check className="size-3.5" /> reached
            </span>
          ) : (
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatMoney(t.remaining, currency)} to go
              {t.perDay != null && ` · ${formatMoney(t.perDay, currency)}/workday`}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
