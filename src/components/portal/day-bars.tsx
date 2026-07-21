import { formatMoney } from "@/lib/commission";
import { shortDate } from "@/lib/format-date";
import type { DayTally } from "@/lib/personal-stats";

/**
 * The period's net sales day by day — CSS bars, no chart runtime. Days with no
 * sale stay in the list at zero height so gaps are visible.
 */
export function DayBars({
  days,
  currency,
}: {
  days: DayTally[];
  currency: string;
}) {
  const max = days.reduce((m, d) => Math.max(m, d.net), 0);
  if (max <= 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-32 items-end gap-1">
        {days.map((d) => (
          <div
            key={d.day}
            className="group relative flex h-full flex-1 items-end"
            title={`${shortDate(d.day)} · ${formatMoney(d.net, currency)} · ${d.orders} order${d.orders === 1 ? "" : "s"}`}
          >
            <div
              className="bg-primary w-full rounded-t-sm"
              style={{ height: `${Math.max((d.net / max) * 100, d.net > 0 ? 3 : 0)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>{shortDate(days[0].day)}</span>
        <span>{shortDate(days[days.length - 1].day)}</span>
      </div>
    </div>
  );
}
