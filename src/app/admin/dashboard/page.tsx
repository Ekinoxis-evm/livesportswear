import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { accessibleLocationIds } from "@/lib/auth";
import { businessDate } from "@/lib/business-date";
import { primaryTimezone } from "@/lib/business-tz";
import { getPayPeriod } from "@/lib/payroll-config";
import { sprintRange, payday } from "@/lib/scheduling/payroll";
import { weekStart, weekDays } from "@/lib/scheduling/week";
import { coverageSummary, type StatShift } from "@/lib/scheduling/stats";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  asTiers,
  commissionFor,
  formatMoney,
  resolveTiers,
  type CommissionTier,
} from "@/lib/commission";
import type { SalesBreakdown } from "@/lib/sales-breakdown";
import { formatPct, formatDuration } from "@/lib/conversion";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { fetchDaySales, type DaySales } from "@/lib/shopify";
import { monthRangeInTz, dayRangeInTz, customRangeInTz } from "@/lib/shopify-range";
import { getStaffSalesCached } from "@/lib/shopify-range-cache";
import {
  periodBounds,
  resolveSalesPeriod,
  staffRowsFromEntries,
  type SalesRankRow,
} from "@/lib/sales-period";
import { PeriodPills } from "@/components/shared/period-pills";
import { SalesRankTable } from "@/components/shared/sales-rank-table";
import { shortDate, shortDateRange, monthLabel } from "@/lib/format-date";
import { storeMonthlyData } from "@/lib/monthly-series";
import { SyncSalesButton } from "@/components/commission/sync-sales-button";
import { SalesBreakdownSubline } from "@/components/shared/sales-breakdown-view";
import { StoreSalesChart } from "@/components/dashboard/sales-charts";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    month?: string;
    period?: string;
    from?: string;
    to?: string;
    loc?: string;
  }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerClient();
  const tz = await primaryTimezone();
  const today = businessDate(tz);
  const { anchor } = await getPayPeriod();
  const sprint = sprintRange(anchor, today);
  const nextPayday = payday(anchor, today);
  const days = weekDays(weekStart(today));

  const [{ count: pending }, locationsRes, templatesRes, weekShiftsRes] =
    await Promise.all([
      supabase
        .from("time_off_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase.from("locations").select("id, name").eq("active", true).order("name"),
      supabase
        .from("shift_templates")
        .select("id, location_id, default_headcount")
        .eq("active", true),
      supabase
        .from("shifts")
        .select(
          "employee_id, date, start_time, end_time, shift_template_id, schedules!inner(location_id)",
        )
        .gte("date", days[0])
        .lte("date", days[6]),
    ]);

  // A location-scoped admin only sees the stores they manage (locations are
  // world-readable, so this must be filtered explicitly — like the Performance
  // pages do — or the dashboard shows cards for stores they don't manage).
  const access = await accessibleLocationIds();
  const locations = (locationsRes.data ?? []).filter(
    (l) => access === "all" || access.includes(l.id),
  );
  const templates = templatesRes.data ?? [];
  const weekShifts = (weekShiftsRes.data ?? []) as (StatShift & {
    schedules: { location_id: string };
  })[];

  // Coverage per location (this week).
  const coverage = locations.map((loc) => {
    const locTemplates = templates.filter((t) => t.location_id === loc.id);
    const locShifts = weekShifts.filter(
      (s) => s.schedules.location_id === loc.id,
    );
    const cov = coverageSummary({ shifts: locShifts, templates: locTemplates, days });
    const rate =
      cov.rows.length === 0
        ? 1
        : cov.rows.reduce((a, r) => a + r.rate, 0) / cov.rows.length;
    return { id: loc.id, name: loc.name, open: cov.openShifts, rate };
  });
  const openTotal = coverage.reduce((a, c) => a + c.open, 0);

  // Month-scoped business metrics follow ?month (‹ › pager); day cards and
  // the schedule/coverage cards always stay on today.
  const currentMonth = today.slice(0, 7);
  const MIN_MONTH = "2024-01";
  // Clamp (like the year pager) rather than reset — an out-of-range param
  // must not silently jump the admin back to today.
  const month =
    sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month)
      ? sp.month < MIN_MONTH
        ? MIN_MONTH
        : sp.month > currentMonth
          ? currentMonth
          : sp.month
      : currentMonth;
  const year = Number(month.slice(0, 4));
  const monthNum = Number(month.slice(5, 7));
  const monthStart = `${month}-01`;
  const nextMonthStart = new Date(Date.UTC(year, monthNum, 1))
    .toISOString()
    .slice(0, 10);
  // The ?year param scopes only the year chart.
  const currentYear = Number(today.slice(0, 4));
  const chartYear =
    sp.year && /^\d{4}$/.test(sp.year)
      ? Math.min(Math.max(Number(sp.year), 2024), currentYear)
      : currentYear;
  // Links merge both params so the month pager and year pager can't clobber
  // each other.
  const qs = (next: Partial<{ month: string; year: number }>) => {
    const p = new URLSearchParams();
    const m = next.month ?? month;
    const y = next.year ?? chartYear;
    if (m !== currentMonth) p.set("month", m);
    if (y !== currentYear) p.set("year", String(y));
    if (sp.loc) p.set("loc", sp.loc);
    if (sp.period) p.set("period", sp.period);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    const s = p.toString();
    return s ? `/admin/dashboard?${s}` : "/admin/dashboard";
  };

  const [salesRes, goalsRes, employeesRes, eventsRes, adsRes, cfgRes, yearSalesRes, yearGoalsRes] = await Promise.all([
    supabase
      .from("monthly_sales")
      .select("employee_id, amount, gross_amount, discounts_amount, returns_amount")
      .eq("month", month),
    supabase
      .from("store_goals")
      .select("location_id, goal_amount, tiers")
      .eq("year", year)
      .eq("month", monthNum),
    // No active filter: a rep who left keeps their history — a browsed past
    // month must not lose their revenue from store totals and the ranking.
    supabase
      .from("employees")
      .select("id, name, location_id, avatar_color, active, shopify_staff_id, locations(name)"),
    supabase
      .from("client_events")
      .select("sold, served_seconds")
      .gte("business_date", monthStart)
      .lt("business_date", nextMonthStart),
    supabase
      .from("ad_insights")
      .select("spend, revenue")
      .gte("date", monthStart)
      .lt("date", nextMonthStart),
    supabase.from("commission_config").select("currency, tiers").eq("id", 1).maybeSingle(),
    supabase
      .from("monthly_sales")
      .select("employee_id, month, amount")
      .like("month", `${chartYear}-%`),
    supabase
      .from("store_goals")
      .select("month, goal_amount")
      .eq("year", chartYear),
  ]);
  const currency = cfgRes.data?.currency ?? "USD";

  // Sales roll up per store via each employee's location, so every store's
  // sales compare against that store's own goal — never a cross-store mix.
  const monthEmployees = employeesRes.data ?? [];
  const locOf = new Map(monthEmployees.map((e) => [e.id, e.location_id]));
  const salesByEmployee = new Map(
    (salesRes.data ?? []).map((r) => [r.employee_id, Number(r.amount)]),
  );
  const goalByLoc = new Map(
    (goalsRes.data ?? []).map((g) => [g.location_id, Number(g.goal_amount)]),
  );
  const storeSales = locations.map((loc) => {
    const sales = [...salesByEmployee.entries()]
      .filter(([empId]) => locOf.get(empId) === loc.id)
      .reduce((a, [, amt]) => a + amt, 0);
    const goal = goalByLoc.get(loc.id) ?? 0;
    return {
      id: loc.id,
      name: loc.name,
      sales,
      goal,
      pct: goal > 0 ? sales / goal : null,
    };
  });
  // The month ranking with commission — rate uses each rep's store tiers for
  // the browsed month (past months rank with that month's tiers).
  const globalTiers: CommissionTier[] = asTiers(cfgRes.data?.tiers);
  const monthTiersByLoc: Record<string, CommissionTier[]> = {};
  for (const g of goalsRes.data ?? []) {
    monthTiersByLoc[g.location_id] = resolveTiers(g.tiers, globalTiers);
  }
  const salesRowBy = new Map((salesRes.data ?? []).map((r) => [r.employee_id, r]));
  const ranking = monthEmployees
    .filter((e) => e.active || salesRowBy.has(e.id))
    .map((e) => {
      const row = salesRowBy.get(e.id);
      const amount = Number(row?.amount ?? 0);
      const breakdown: SalesBreakdown | null =
        row?.gross_amount != null
          ? {
              gross: Number(row.gross_amount),
              discounts: Number(row.discounts_amount ?? 0),
              returns: Number(row.returns_amount ?? 0),
              net: amount,
            }
          : null;
      const tiers = monthTiersByLoc[e.location_id] ?? globalTiers;
      return {
        id: e.id,
        name: e.name,
        location_id: e.location_id,
        amount,
        breakdown,
        ...commissionFor(amount, tiers),
      };
    })
    .sort((a, b) => b.amount - a.amount);
  const salesTotal = ranking.reduce((a, r) => a + r.amount, 0);

  // The standard sales-period module — Month (default, with commission) reads
  // the synced DB and follows the ‹ › month pager; the live periods rank
  // attributed Shopify sales without commission (tiers are monthly).
  const { mode, from, to } = resolveSalesPeriod(
    sp,
    today,
    ["today", "week", "month", "custom"],
    "month",
  );
  // Store FILTER (pills) instead of a Store column in the table.
  const selectedLoc = locations.find((l) => l.id === sp.loc) ?? null;
  let rankRows: SalesRankRow[] = ranking
    .filter((r) => !selectedLoc || r.location_id === selectedLoc.id)
    .map((r) => ({
    name: r.name,
    breakdown: r.breakdown,
    net: r.amount,
    rate: r.rate,
    earned: r.earned,
    nextTierLabel: r.nextTier
      ? `${formatMoney(r.nextTier.remaining, currency)} → ${(r.nextTier.rate * 100).toFixed(1)}%`
      : "Top tier",
  }));
  if (mode !== "month") {
    rankRows = [];
    if (isShopifyConfigured()) {
      const bounds = periodBounds(mode, { today, from, to });
      const range = customRangeInTz(bounds.from, bounds.to, tz);
      const entries = await getStaffSalesCached(range.start, range.endExclusive);
      if (entries) {
        rankRows = staffRowsFromEntries(
          entries,
          monthEmployees
            .filter(
              (e) => e.active && (!selectedLoc || e.location_id === selectedLoc.id),
            )
            .map((e) => ({ name: e.name, shopify_staff_id: e.shopify_staff_id })),
        );
      }
    }
  }
  const periodHidden: Record<string, string> = {};
  if (month !== currentMonth) periodHidden.month = month;
  if (chartYear !== currentYear) periodHidden.year = String(chartYear);
  if (selectedLoc) periodHidden.loc = selectedLoc.id;

  const yearRows = (yearSalesRes.data ?? []).map((r) => ({
    employee_id: r.employee_id,
    month: r.month,
    amount: Number(r.amount),
  }));
  // Lines end at TODAY's month for the current year (not the ?month being
  // browsed) — a month that hasn't happened isn't $0.
  const throughMonth =
    chartYear === currentYear ? Number(today.slice(5, 7)) : 12;
  const storeData = storeMonthlyData(
    yearRows,
    chartYear,
    (yearGoalsRes.data ?? []).map((g) => ({
      month: g.month,
      goal_amount: Number(g.goal_amount),
    })),
    throughMonth,
  );

  const evs = eventsRes.data ?? [];
  const convMTD = evs.length === 0 ? null : evs.filter((e) => e.sold).length / evs.length;
  const timedEvs = evs.filter((e) => e.served_seconds != null);
  const avgTimeMTD = timedEvs.length
    ? Math.round(timedEvs.reduce((s, e) => s + (e.served_seconds ?? 0), 0) / timedEvs.length)
    : null;
  const spend = (adsRes.data ?? []).reduce((a, r) => a + Number(r.spend), 0);
  const revenue = (adsRes.data ?? []).reduce((a, r) => a + Number(r.revenue), 0);
  const roas = spend > 0 ? revenue / spend : null;

  // Store metrics straight from Shopify (orders + tickets aren't in the DB).
  let shopMonth: DaySales | null = null;
  let shopToday: DaySales | null = null;
  if (isShopifyConfigured()) {
    try {
      const mr = monthRangeInTz(month, tz);
      const dr = dayRangeInTz(today, tz);
      [shopMonth, shopToday] = await Promise.all([
        fetchDaySales(mr.start, mr.endExclusive),
        fetchDaySales(dr.start, dr.endExclusive),
      ]);
    } catch {
      // cards fall back to em dashes
    }
  }
  const avgTicket =
    shopMonth && shopMonth.orders > 0 ? shopMonth.total / shopMonth.orders : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <SyncSalesButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Current pay sprint</CardDescription>
            <CardTitle className="text-base">
              {shortDateRange(sprint.start, sprint.end)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Next payday</CardDescription>
            <CardTitle className="text-base">{shortDate(nextPayday)}</CardTitle>
          </CardHeader>
        </Card>
        <Link href="/admin/schedules" className="block">
          <Card className="hover:border-primary h-full transition-colors">
            <CardHeader>
              <CardDescription>Pending time off</CardDescription>
              <CardTitle className="text-base tabular-nums">
                {pending ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/admin/schedules" className="block">
          <Card className="hover:border-primary h-full transition-colors">
            <CardHeader>
              <CardDescription>Open shifts this week</CardDescription>
              <CardTitle className="text-base tabular-nums">
                {openTotal}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          {monthLabel(month)}
        </h2>
        <div className="flex items-center gap-1">
          {month > MIN_MONTH && (
            <Link
              href={qs({ month: shiftMonth(month, -1) })}
              aria-label="Previous month"
              className="hover:bg-muted rounded-md border p-1.5"
            >
              <ChevronLeft className="size-4" />
            </Link>
          )}
          {month !== currentMonth && (
            <Link
              href={qs({ month: currentMonth })}
              className="px-1 text-sm underline-offset-4 hover:underline"
            >
              This month
            </Link>
          )}
          {month < currentMonth && (
            <Link
              href={qs({ month: shiftMonth(month, 1) })}
              aria-label="Next month"
              className="hover:bg-muted rounded-md border p-1.5"
            >
              <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {storeSales.map((s) => (
          <Link key={s.id} href="/admin/commission" className="block">
            <Card className="hover:border-primary h-full transition-colors">
              <CardHeader>
                <CardDescription>
                  {s.name} · {monthLabel(month)}
                </CardDescription>
                <CardTitle className="text-base tabular-nums">
                  {formatMoney(s.sales, currency)}
                  {s.goal > 0 && (
                    <span className="text-muted-foreground text-sm font-normal">
                      {" "}
                      / {formatMoney(s.goal, currency)}
                    </span>
                  )}
                </CardTitle>
                <CardDescription>
                  {s.pct != null
                    ? `${Math.round(s.pct * 100)}% of goal`
                    : "Set a goal in Sales & Commission"}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
        <Card>
          <CardHeader>
            <CardDescription>Conversion · {monthLabel(month)}</CardDescription>
            <CardTitle className="text-base tabular-nums">
              {convMTD != null ? formatPct(convMTD) : "—"}
            </CardTitle>
            <CardDescription>
              {convMTD != null
                ? `${evs.length} clients attended${avgTimeMTD != null ? ` · ${formatDuration(avgTimeMTD)} avg` : ""}`
                : "No clients logged yet"}
            </CardDescription>
          </CardHeader>
        </Card>
        <Link href="/admin/marketing" className="block">
          <Card className="hover:border-primary h-full transition-colors">
            <CardHeader>
              <CardDescription>Ad ROAS · {monthLabel(month)}</CardDescription>
              <CardTitle className="text-base tabular-nums">
                {roas != null ? `${roas.toFixed(2)}×` : "—"}
              </CardTitle>
              <CardDescription>
                {roas != null
                  ? `${formatMoney(spend, currency)} spend`
                  : "Connect Meta Ads"}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ranking{mode === "month" ? ` · ${monthLabel(month)}` : ""}
          </CardTitle>
          <CardDescription>
            {mode === "month" ? (
              <>
                Net sales synced from Shopify — rate uses each rep&apos;s store
                tiers · total{" "}
                <span className="font-semibold tabular-nums">
                  {formatMoney(salesTotal, currency)}
                </span>
              </>
            ) : (
              "Attributed live Shopify sales — commission is monthly, so it shows in Month view."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {locations.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {[null, ...locations].map((l) => {
                const p = new URLSearchParams(periodHidden);
                p.delete("loc");
                if (l) p.set("loc", l.id);
                if (mode !== "month") {
                  if (mode === "custom") {
                    p.set("from", from);
                    p.set("to", to);
                  } else {
                    p.set("period", mode);
                  }
                }
                const qsStr = p.toString();
                const active = l ? selectedLoc?.id === l.id : selectedLoc === null;
                return (
                  <Link
                    key={l?.id ?? "all"}
                    href={qsStr ? `/admin/dashboard?${qsStr}` : "/admin/dashboard"}
                    className={
                      "rounded-full border px-3 py-1 text-sm " +
                      (active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted")
                    }
                  >
                    {l?.name ?? "All stores"}
                  </Link>
                );
              })}
            </div>
          )}
          <PeriodPills
            basePath="/admin/dashboard"
            mode={mode}
            from={from}
            to={to}
            hidden={periodHidden}
            periods={["today", "week", "month", "custom"]}
            defaultPeriod="month"
            labels={{ month: monthLabel(month) }}
          />
          <SalesRankTable
            rows={rankRows}
            currency={currency}
            showCommission={mode === "month"}
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Sales · {chartYear}
        </h2>
        <div className="flex items-center gap-1">
          <Link
            href={qs({ year: chartYear - 1 })}
            aria-label="Previous year"
            className="hover:bg-muted rounded-md border p-1.5"
          >
            <ChevronLeft className="size-4" />
          </Link>
          {chartYear !== currentYear && (
            <Link
              href={qs({ year: currentYear })}
              className="px-1 text-sm underline-offset-4 hover:underline"
            >
              This year
            </Link>
          )}
          {chartYear < currentYear && (
            <Link
              href={qs({ year: chartYear + 1 })}
              aria-label="Next year"
              className="hover:bg-muted rounded-md border p-1.5"
            >
              <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
      <StoreSalesChart year={chartYear} currency={currency} data={storeData} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Orders · {monthLabel(month)}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {shopMonth ? shopMonth.orders : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Average ticket · {monthLabel(month)}</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {avgTicket != null ? formatMoney(avgTicket, currency) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Net sales today</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {shopToday ? formatMoney(shopToday.net, currency) : "—"}
            </CardTitle>
            {shopToday && (
              <SalesBreakdownSubline sales={shopToday} currency={currency} />
            )}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Orders today</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {shopToday ? shopToday.orders : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coverage health</CardTitle>
            <CardDescription>
              Template coverage this week, per store.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {coverage.length === 0 ? (
              <p className="text-muted-foreground text-sm">No active stores.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {coverage.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span>{c.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground tabular-nums">
                        {Math.round(c.rate * 100)}%
                      </span>
                      {c.open > 0 ? (
                        <Badge variant="secondary">{c.open} open</Badge>
                      ) : (
                        <Badge variant="default">Full</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
