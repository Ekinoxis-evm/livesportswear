import { formatMoney } from "@/lib/commission";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { isoWeekday } from "@/lib/scheduling/week";
import { cn } from "@/lib/utils";
import type { WeekChart } from "@/lib/week-sales-chart";

/**
 * The week's sales as one stacked bar per day: bar height = the store's total
 * net that day, the coloured stack = each rep's attributed sales (their profile
 * colour), a muted "Other" cap = unattributed walk-ins. CSS-only, no chart
 * runtime (mirrors DayBars). Theme-aware.
 */
function compact(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}

export function WeekSalesChart({
  chart,
  currency,
  today,
}: {
  chart: WeekChart;
  currency: string;
  today: string;
}) {
  const { days, weekMax, legend } = chart;
  if (weekMax <= 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Legend — who each colour is */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {legend.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: l.color }}
            />
            <span className={l.key === "__other__" ? "text-muted-foreground" : ""}>
              {l.label}
            </span>
          </span>
        ))}
      </div>

      {/* Bars */}
      <div className="flex items-stretch gap-1.5 sm:gap-2">
        {days.map((d) => {
          const isToday = d.date === today;
          return (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[11px] font-medium tabular-nums">
                {d.total > 0 ? compact(d.total) : ""}
              </span>
              <div className="flex h-40 w-full items-end">
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm"
                  style={{ height: `${Math.max((d.total / weekMax) * 100, d.total > 0 ? 2 : 0)}%` }}
                >
                  {d.segments.map((seg) => (
                    <div
                      key={seg.key}
                      title={`${seg.label} · ${formatMoney(seg.net, currency)}`}
                      style={{
                        backgroundColor: seg.color,
                        height: `${(seg.net / d.total) * 100}%`,
                        minHeight: seg.net > 0 ? "2px" : 0,
                      }}
                    />
                  ))}
                </div>
              </div>
              <div
                className={cn(
                  "flex flex-col items-center text-[11px] leading-tight",
                  isToday ? "text-primary font-semibold" : "text-muted-foreground",
                )}
              >
                <span>{SHORT_WEEKDAYS[isoWeekday(d.date) - 1]}</span>
                <span className="tabular-nums">{d.date.slice(8, 10)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
