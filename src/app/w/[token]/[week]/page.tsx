import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { weekStart, weekDays, addDays, isoWeekday, formatWeekRange } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { SHIFT_SLOTS, templateForSlot, shiftMatchesSlot } from "@/lib/shift-slots";
import { SLOT_COLOR } from "@/lib/shift-color";
import { ShiftChip } from "@/components/schedule/shift-chip";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { getShareDaySales, getShareWeekSales } from "@/lib/share-sales-cache";
import { staffRowsFromEntries, type SalesRankRow } from "@/lib/sales-period";
import { PeriodPills } from "@/components/shared/period-pills";
import { SalesRankTable } from "@/components/shared/sales-rank-table";
import { formatMoney } from "@/lib/commission";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { RefreshSalesButton } from "@/components/shared/refresh-sales-button";
import { SalesBreakdownBlock } from "@/components/shared/sales-breakdown-view";
import { sumBreakdowns, type SalesBreakdown } from "@/lib/sales-breakdown";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const hhmm = (t: string) => t.slice(0, 5);

type ShiftRow = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_template_id: string | null;
  employee: { name: string; role: string; avatar_color: string | null } | null;
};

function Chip({ shift, withTime }: { shift: ShiftRow; withTime?: boolean }) {
  return (
    <ShiftChip
      name={shift.employee?.name ?? "—"}
      color={shift.employee?.avatar_color}
      isManager={shift.employee?.role === "store_manager"}
      timeLabel={withTime ? `${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : undefined}
    />
  );
}

export default async function StoreWeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; week: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { token, week } = await params;
  const sp = await searchParams;
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
        "employee_id, date, start_time, end_time, shift_template_id, employee:employees(name, role, avatar_color)",
      )
      .eq("schedule_id", schedule.id)
      .order("date")
      .order("start_time");
    shifts = (data ?? []) as ShiftRow[];
  }

  const days = weekDays(monday);
  const today = businessDate(loc.timezone);
  const thisWeek = weekStart(today);

  // Sales ranking — the standard module, limited to This week · Today on the
  // public page. Every mapped, active employee appears, $0 included (a quiet
  // period must not make anyone vanish from the list).
  const salesMode: "week" | "today" = sp.period === "today" ? "today" : "week";
  let rankRows: SalesRankRow[] = [];
  if (schedule && isShopifyConfigured()) {
    try {
      const entriesPromise =
        salesMode === "today"
          ? getShareDaySales(loc.id, today, loc.timezone).then((r) => r.entries)
          : getShareWeekSales(loc.id, monday, loc.timezone).then((r) => r.entries);
      const [entries, { data: emps }] = await Promise.all([
        entriesPromise,
        supabase
          .from("employees")
          .select("name, shopify_staff_id")
          .eq("location_id", loc.id)
          .eq("active", true)
          .not("shopify_staff_id", "is", null),
      ]);
      rankRows = staffRowsFromEntries(entries, emps ?? []);
    } catch {
      // section hidden when Shopify is unreachable
    }
  }
  const weekTotal = sumBreakdowns(
    rankRows.map((r) => r.breakdown).filter((b): b is SalesBreakdown => b !== null),
  );

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

      {rankRows.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Trophy className="size-4 text-amber-500" />
                {salesMode === "today" ? "Sales today" : "Sales this week"}
                {salesMode === "week" && (
                  <RefreshSalesButton token={token} week={monday} />
                )}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatMoney(weekTotal.net)} net
              </span>
            </div>
            <PeriodPills
              basePath={`/w/${token}/${monday}`}
              mode={salesMode}
              from={monday}
              to={today}
              periods={["today", "week"]}
              defaultPeriod="week"
              labels={{ week: "This week" }}
            />
            <SalesBreakdownBlock sales={weekTotal} className="max-w-xs" />
            <SalesRankTable rows={rankRows} currency="USD" />
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
