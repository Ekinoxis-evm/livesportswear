import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { ChevronLeft, ChevronRight, Crown, Trophy } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { weekStart, weekDays, addDays, isoWeekday, formatWeekRange } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { SHIFT_SLOTS, templateForSlot, shiftMatchesSlot } from "@/lib/shift-slots";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { fetchStaffSales } from "@/lib/shopify";
import { weekRangeInTz, normalizeStaffId } from "@/lib/shopify-range";
import { formatMoney } from "@/lib/commission";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const hhmm = (t: string) => t.slice(0, 5);

// One Shopify read per (location, week) per 10 minutes — this page is public.
const cachedWeekSales = unstable_cache(
  async (monday: string, tz: string): Promise<[string, number][]> => {
    const range = weekRangeInTz(monday, tz);
    const { totals } = await fetchStaffSales(range.start, range.endExclusive);
    return [...totals.entries()];
  },
  ["share-week-sales"],
  { revalidate: 600 },
);

// Same fallback colors as the admin board's slot rows.
const SLOT_COLOR: Record<string, string> = {
  morning: "#22c55e",
  evening: "#a855f7",
};

type ShiftRow = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_template_id: string | null;
  employee: { name: string; role: string } | null;
};

function Chip({ shift, withTime }: { shift: ShiftRow; withTime?: boolean }) {
  return (
    <span className="bg-muted flex items-center gap-1 rounded-md px-2 py-1 text-xs">
      {shift.employee?.role === "store_manager" && (
        <Crown className="size-3 shrink-0 text-amber-500" />
      )}
      <span className="truncate">{shift.employee?.name ?? "—"}</span>
      {withTime && (
        <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
          {hhmm(shift.start_time)}–{hhmm(shift.end_time)}
        </span>
      )}
    </span>
  );
}

export default async function StoreWeekPage({
  params,
}: {
  params: Promise<{ token: string; week: string }>;
}) {
  const { token, week } = await params;
  if (!DATE_RE.test(week)) notFound();

  const supabase = createServiceClient();
  const { data: loc } = await supabase
    .from("locations")
    .select("id, name, timezone")
    .eq("share_token", token)
    .maybeSingle();
  if (!loc) notFound();

  // Any date in the week resolves to its Monday so shared links can't fragment.
  const monday = weekStart(week);
  if (monday !== week) redirect(`/w/${token}/${monday}`);

  const [{ data: schedule }, { data: templateRows }] = await Promise.all([
    supabase
      .from("schedules")
      .select("id")
      .eq("location_id", loc.id)
      .eq("week_start", monday)
      .eq("status", "published")
      .maybeSingle(),
    supabase
      .from("shift_templates")
      .select("id, name, start_time, end_time, color")
      .eq("location_id", loc.id)
      .eq("active", true),
  ]);
  const templates = templateRows ?? [];

  let shifts: ShiftRow[] = [];
  if (schedule) {
    const { data } = await supabase
      .from("shifts")
      .select(
        "employee_id, date, start_time, end_time, shift_template_id, employee:employees(name, role)",
      )
      .eq("schedule_id", schedule.id)
      .order("date")
      .order("start_time");
    shifts = (data ?? []) as ShiftRow[];
  }

  const days = weekDays(monday);
  const today = businessDate(loc.timezone);
  const thisWeek = weekStart(today);

  // Week sales ranking — every mapped, active employee of this store appears,
  // $0 included (a quiet week must not make anyone vanish from the list).
  // Sales by staff we can't attribute to someone at this store are left out.
  let weekRanking: { name: string; amount: number }[] = [];
  if (schedule && isShopifyConfigured()) {
    try {
      const [entries, { data: emps }] = await Promise.all([
        cachedWeekSales(monday, loc.timezone),
        supabase
          .from("employees")
          .select("name, shopify_staff_id")
          .eq("location_id", loc.id)
          .eq("active", true)
          .not("shopify_staff_id", "is", null),
      ]);
      const byStaff = new Map(entries);
      weekRanking = (emps ?? [])
        .map((e) => ({
          name: e.name,
          amount: byStaff.get(normalizeStaffId(e.shopify_staff_id as string)) ?? 0,
        }))
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    } catch {
      // section hidden when Shopify is unreachable
    }
  }
  const weekTotal = weekRanking.reduce((a, r) => a + r.amount, 0);

  const slots = SHIFT_SLOTS.map((slot) => ({ slot, tpl: templateForSlot(slot, templates) }));
  const inAnySlot = (s: ShiftRow) =>
    slots.some(({ slot, tpl }) => shiftMatchesSlot(s, slot, tpl));
  const otherShifts = shifts.filter((s) => !inAnySlot(s));

  return (
    <div className="flex min-h-screen flex-col">
      {/* Brand header — the same forest green as the admin sidebar */}
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-end justify-between gap-3 px-6 py-5">
          <div>
            <p className="text-sidebar-foreground/70 text-xs font-semibold uppercase tracking-wide">
              LIVE! · Team schedule
            </p>
            <h1 className="text-xl font-bold">{loc.name}</h1>
            <p className="text-sidebar-foreground/70 text-sm tabular-nums">
              {formatWeekRange(monday)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href={`/w/${token}/${addDays(monday, -7)}`}
              aria-label="Previous week"
              className="border-sidebar-border rounded-md border p-1.5 hover:bg-white/10"
            >
              <ChevronLeft className="size-4" />
            </Link>
            {monday !== thisWeek && (
              <Link
                href={`/w/${token}/${thisWeek}`}
                className="px-1 text-sm underline-offset-4 hover:underline"
              >
                This week
              </Link>
            )}
            <Link
              href={`/w/${token}/${addDays(monday, 7)}`}
              aria-label="Next week"
              className="border-sidebar-border rounded-md border p-1.5 hover:bg-white/10"
            >
              <ChevronRight className="size-4" />
            </Link>
            <ThemeToggle className="text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground ml-1" />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6">

      {!schedule ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            This week hasn&apos;t been published yet.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="bg-muted/50 sticky left-0 z-10 p-2 text-left font-medium">
                  Shift
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={cn(
                      "min-w-28 p-2 text-left font-medium",
                      d === today && "text-primary",
                    )}
                  >
                    <span className="text-muted-foreground">
                      {SHORT_WEEKDAYS[isoWeekday(d) - 1]}
                    </span>{" "}
                    <span className="tabular-nums">{d.slice(8, 10)}</span>
                    {d === today && (
                      <span className="text-primary ml-1 text-[10px] font-semibold uppercase">
                        Today
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map(({ slot, tpl }) => {
                const color = tpl?.color ?? SLOT_COLOR[slot.key] ?? "var(--color-primary)";
                return (
                  <tr key={slot.key} className="border-t align-top">
                    <td className="bg-background sticky left-0 z-10 p-2">
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          aria-hidden
                          className="h-4 w-1 rounded"
                          style={{ backgroundColor: color }}
                        />
                        <span className="flex flex-col">
                          {slot.label}
                          <span className="text-muted-foreground text-xs font-normal tabular-nums">
                            {slot.start}–{slot.end}
                          </span>
                        </span>
                      </span>
                    </td>
                    {days.map((d) => {
                      const assigned = shifts.filter(
                        (s) => s.date === d && shiftMatchesSlot(s, slot, tpl),
                      );
                      return (
                        <td
                          key={d}
                          className={cn(
                            "border-l p-1.5 align-top",
                            d === today && "bg-primary/5",
                          )}
                        >
                          <div className="flex flex-col gap-1">
                            {assigned.map((s, i) => (
                              <Chip key={`${s.employee_id}-${i}`} shift={s} />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {otherShifts.length > 0 && (
                <tr className="border-t align-top">
                  <td className="bg-background sticky left-0 z-10 p-2">
                    <span className="flex items-center gap-2 font-medium">
                      <span aria-hidden className="bg-muted-foreground h-4 w-1 rounded" />
                      Other
                    </span>
                  </td>
                  {days.map((d) => (
                    <td
                      key={d}
                      className={cn(
                        "border-l p-1.5 align-top",
                        d === today && "bg-primary/5",
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        {otherShifts
                          .filter((s) => s.date === d)
                          .map((s, i) => (
                            <Chip key={`${s.employee_id}-${i}`} shift={s} withTime />
                          ))}
                      </div>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {weekRanking.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Trophy className="size-4 text-amber-500" /> Sales this week
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatMoney(weekTotal)}
              </span>
            </div>
            <ul className="flex flex-col divide-y">
              {weekRanking.map((r, i) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>
                    <span className="text-muted-foreground mr-2 tabular-nums">
                      {i + 1}.
                    </span>
                    {r.name}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(r.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
