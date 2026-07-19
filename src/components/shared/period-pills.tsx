import Link from "next/link";
import { cn } from "@/lib/utils";
import { DateRangeForm } from "@/components/shared/date-range-form";
import type { SalesPeriod } from "@/lib/sales-period";

const LABELS: Record<SalesPeriod, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
  custom: "Custom",
};

/**
 * The standard period switcher for ranked sales: Today · Week · Month ·
 * Custom. Custom is a button — the date pickers appear only once it's
 * active (server-rendered reveal, no JS). `hidden` params survive every
 * pill and the date form.
 */
export function PeriodPills({
  basePath,
  mode,
  from,
  to,
  hidden = {},
  periods = ["today", "week", "month", "custom"],
  labels = {},
}: {
  basePath: string;
  mode: SalesPeriod;
  from: string;
  to: string;
  hidden?: Record<string, string>;
  periods?: SalesPeriod[];
  labels?: Partial<Record<SalesPeriod, string>>;
}) {
  const href = (period: SalesPeriod) => {
    const p = new URLSearchParams(hidden);
    if (period !== periods[0]) p.set("period", period);
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {periods.map((p) => (
          <Link
            key={p}
            href={href(p)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium",
              mode === p
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-muted",
            )}
          >
            {labels[p] ?? LABELS[p]}
          </Link>
        ))}
      </div>
      {mode === "custom" && (
        <DateRangeForm
          from={from}
          to={to}
          action={basePath}
          hidden={{ ...hidden, period: "custom" }}
        />
      )}
    </div>
  );
}
