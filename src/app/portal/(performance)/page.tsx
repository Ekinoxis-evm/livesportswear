import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { weekStart, weekDays, addDays } from "@/lib/scheduling/week";
import { businessDate } from "@/lib/business-date";
import { employeeStats, type StatShift } from "@/lib/scheduling/stats";
import { monthLabel } from "@/lib/format-date";
import { formatDuration } from "@/lib/conversion";
import {
  commissionFor,
  formatMoney,
  asTiers,
  resolveTiers,
} from "@/lib/commission";
import { repMonthlyData } from "@/lib/monthly-series";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/portal/stats";
import { GoalMeter } from "@/components/shared/goal-meter";
import { SyncSalesButton } from "@/components/shared/sync-sales-button";
import { portalSyncSales } from "@/server/clients";
import { buildGoalMeter } from "@/lib/goal-meter";
import { goalPace } from "@/lib/goal-pace";
import { remainingWorkdays } from "@/lib/scheduling/workdays";
import { RepSalesChart } from "@/components/dashboard/sales-charts";

export default async function PortalOverviewPage() {
  const { employee } = await requireEmployee();
  const supabase = await createServerClient();

  const { data: location } = await supabase
    .from("locations")
    .select("timezone")
    .eq("id", employee.location_id)
    .maybeSingle();
  // "Today" in the store's timezone, not the server's UTC.
  const today = businessDate(location?.timezone ?? "UTC");
  const thisWeek = new Set(weekDays(weekStart(today)));
  const month = today.slice(0, 7);
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  const monthEnd = `${month}-${String(new Date(Date.UTC(year, monthNum, 0)).getUTCDate()).padStart(2, "0")}`;

  const [
    { data: shiftData },
    { data: cfg },
    { data: storeGoal },
    { data: myMonths },
    { data: personalGoal },
    { data: monthEvents },
  ] = await Promise.all([
    // Hours (published shifts around now).
    supabase
      .from("shifts")
      .select(
        "id, employee_id, date, start_time, end_time, shift_template_id, schedules!inner(status)",
      )
      .eq("employee_id", employee.id)
      .eq("schedules.status", "published")
      .gte("date", addDays(today, -35))
      .lte("date", addDays(today, 40)),
    supabase.from("commission_config").select("currency, tiers").eq("id", 1).maybeSingle(),
    supabase
      .from("store_goals")
      .select("tiers")
      .eq("location_id", employee.location_id)
      .eq("year", year)
      .eq("month", monthNum)
      .maybeSingle(),
    // Every month ever synced for this rep — the all-time card and the chart.
    supabase
      .from("monthly_sales")
      .select("month, amount")
      .eq("employee_id", employee.id)
      .order("month"),
    supabase
      .from("employee_goals")
      .select("goal_amount")
      .eq("employee_id", employee.id)
      .eq("year", year)
      .eq("month", monthNum)
      .maybeSingle(),
    // This rep's timed clients this month (RLS: client_events_self_read).
    supabase
      .from("client_events")
      .select("served_seconds")
      .eq("employee_id", employee.id)
      .gte("business_date", `${month}-01`)
      .lte("business_date", monthEnd),
  ]);

  const timedMonth = (monthEvents ?? []).filter((e) => e.served_seconds != null);
  const avgClientSeconds = timedMonth.length
    ? Math.round(
        timedMonth.reduce((s, e) => s + (e.served_seconds ?? 0), 0) / timedMonth.length,
      )
    : null;

  const shifts = (shiftData ?? []) as StatShift[];
  const weekStats = employeeStats(
    shifts.filter((s) => thisWeek.has(s.date)),
    employee.id,
  );
  const monthStats = employeeStats(
    shifts.filter((s) => s.date.slice(0, 7) === month),
    employee.id,
  );

  const currency = cfg?.currency ?? "USD";
  const tiers = resolveTiers(storeGoal?.tiers, asTiers(cfg?.tiers));
  const workDaysLeft = remainingWorkdays(
    shifts,
    employee.id,
    today,
    monthEnd,
    employee.max_days_per_week,
  );

  const months = (myMonths ?? []).map((m) => ({
    month: m.month as string,
    amount: Number(m.amount),
  }));
  const mySales = months.find((m) => m.month === month)?.amount ?? 0;
  const commission = commissionFor(mySales, tiers);
  const goalAmount = personalGoal ? Number(personalGoal.goal_amount) : 0;

  const allTimeNet = months.reduce((a, m) => a + m.amount, 0);
  const earned = months.filter((m) => m.amount > 0);
  const bestMonth = earned.reduce<{ month: string; amount: number } | null>(
    (best, m) => (!best || m.amount > best.amount ? m : best),
    null,
  );
  const avgMonth = earned.length ? allTimeNet / earned.length : 0;

  const service = createServiceClient();
  const { data: peerSales } = await service
    .from("monthly_sales")
    .select("amount, employees!inner(active, location_id)")
    .eq("month", month)
    .eq("employees.active", true)
    .eq("employees.location_id", employee.location_id);
  const rank =
    (peerSales ?? []).filter((s) => Number(s.amount) > mySales).length + 1;

  const chart = repMonthlyData(
    months.map((m) => ({ employee_id: employee.id, month: m.month, amount: m.amount })),
    year,
    [{ id: employee.id, name: employee.name, avatar_color: employee.avatar_color }],
    monthNum,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This week</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-8">
            <Stat label="Hours" value={`${weekStats.totalHours.toFixed(1)}h`} />
            <Stat label="Days" value={String(weekStats.daysWorked)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This month</CardTitle>
            <CardDescription>{monthLabel(month)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-8">
            <Stat label="Hours" value={`${monthStats.totalHours.toFixed(1)}h`} />
            <Stat label="Shifts" value={String(monthStats.shiftCount)} />
            <Stat label="Avg time / client" value={formatDuration(avgClientSeconds)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Sales &amp; commission</CardTitle>
              <CardDescription>{monthLabel(month)}</CardDescription>
            </div>
            <SyncSalesButton action={portalSyncSales} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StatGrid>
            <Stat label="Net sales" value={formatMoney(mySales, currency)} />
            <Stat label="Rank at your store" value={`#${rank}`} />
            {tiers.length > 0 && (
              <>
                <Stat label="Rate" value={`${(commission.rate * 100).toFixed(1)}%`} />
                <Stat
                  label="Commission"
                  value={formatMoney(commission.earned, currency)}
                />
              </>
            )}
          </StatGrid>

          <GoalMeter
            model={buildGoalMeter({
              current: mySales,
              milestones: tiers
                .filter((t) => t.min_sales > 0)
                .map((t) => ({
                  value: t.min_sales,
                  label: `${(t.rate * 100).toFixed((t.rate * 100) % 1 === 0 ? 0 : 1)}%`,
                  rate: t.rate,
                })),
              goalValue: goalAmount > 0 ? goalAmount : null,
              paceDays: goalPace(goalAmount, mySales, today, month, workDaysLeft).paceDays,
              workBasis: true,
            })}
            currency={currency}
            title="Your sales this month"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All time</CardTitle>
          <CardDescription>
            Every month synced from Shopify since you started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {earned.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No sales synced yet — your numbers appear here once your first month
              lands.
            </p>
          ) : (
            <StatGrid>
              <Stat label="Net sales" value={formatMoney(allTimeNet, currency)} />
              <Stat
                label="Best month"
                value={formatMoney(bestMonth?.amount ?? 0, currency)}
                hint={bestMonth ? monthLabel(bestMonth.month) : undefined}
              />
              <Stat label="Monthly average" value={formatMoney(avgMonth, currency)} />
              <Stat
                label="Months selling"
                value={String(earned.length)}
                hint={`since ${monthLabel(earned[0].month)}`}
              />
            </StatGrid>
          )}
        </CardContent>
      </Card>

      <RepSalesChart
        year={year}
        currency={currency}
        series={chart.series}
        data={chart.data}
        title={`Your sales · ${year}`}
      />
    </div>
  );
}
