import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { getPayPeriod } from "@/lib/payroll-config";
import { sprintRange, payday } from "@/lib/scheduling/payroll";
import { weekStart, weekDays } from "@/lib/scheduling/week";
import {
  hoursByEmployee,
  coverageSummary,
  type StatShift,
} from "@/lib/scheduling/stats";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HoursChart } from "@/components/dashboard/hours-chart";
import { formatMoney } from "@/lib/commission";
import { formatPct } from "@/lib/conversion";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const today = new Date().toISOString().slice(0, 10);
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
          "employee_id, date, start_time, end_time, shift_template_id, schedules!inner(location_id), employee:employees(name)",
        )
        .gte("date", days[0])
        .lte("date", days[6]),
    ]);

  const locations = locationsRes.data ?? [];
  const templates = templatesRes.data ?? [];
  const weekShifts = (weekShiftsRes.data ?? []) as (StatShift & {
    schedules: { location_id: string };
    employee: { name: string } | null;
  })[];

  // Weekly hours per employee (chart).
  const names = new Map<string, string>();
  for (const s of weekShifts) names.set(s.employee_id, s.employee?.name ?? "?");
  const hours = hoursByEmployee(weekShifts);
  const chartData = Object.entries(hours)
    .map(([id, h]) => ({
      name: names.get(id) ?? "?",
      hours: Math.round(h * 10) / 10,
    }))
    .sort((a, b) => b.hours - a.hours);

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

  // This-month business metrics (all degrade gracefully before keys connect).
  const month = today.slice(0, 7);
  const year = Number(today.slice(0, 4));
  const monthNum = Number(today.slice(5, 7));
  const [salesRes, goalsRes, eventsRes, adsRes, cfgRes] = await Promise.all([
    supabase.from("monthly_sales").select("amount").eq("month", month),
    supabase
      .from("store_goals")
      .select("goal_amount")
      .eq("year", year)
      .eq("month", monthNum),
    supabase
      .from("client_events")
      .select("sold")
      .gte("business_date", `${month}-01`)
      .lte("business_date", `${month}-31`),
    supabase
      .from("ad_insights")
      .select("spend, revenue")
      .gte("date", `${month}-01`)
      .lte("date", `${month}-31`),
    supabase.from("commission_config").select("currency").eq("id", 1).maybeSingle(),
  ]);
  const currency = cfgRes.data?.currency ?? "USD";
  const salesMTD = (salesRes.data ?? []).reduce((a, r) => a + Number(r.amount), 0);
  const goalMTD = (goalsRes.data ?? []).reduce((a, r) => a + Number(r.goal_amount), 0);
  const goalPct = goalMTD > 0 ? salesMTD / goalMTD : null;
  const evs = eventsRes.data ?? [];
  const convMTD = evs.length === 0 ? null : evs.filter((e) => e.sold).length / evs.length;
  const spend = (adsRes.data ?? []).reduce((a, r) => a + Number(r.spend), 0);
  const revenue = (adsRes.data ?? []).reduce((a, r) => a + Number(r.revenue), 0);
  const roas = spend > 0 ? revenue / spend : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Current pay sprint</CardDescription>
            <CardTitle className="text-base tabular-nums">
              {sprint.start} – {sprint.end}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Next payday</CardDescription>
            <CardTitle className="text-base tabular-nums">{nextPayday}</CardTitle>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Sales vs goal · {month}</CardDescription>
            <CardTitle className="text-base tabular-nums">
              {formatMoney(salesMTD, currency)}
              {goalMTD > 0 && (
                <span className="text-muted-foreground text-sm font-normal">
                  {" "}
                  / {formatMoney(goalMTD, currency)}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {goalPct != null
                ? `${Math.round(goalPct * 100)}% of goal`
                : "Set monthly goals in Settings"}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Conversion · {month}</CardDescription>
            <CardTitle className="text-base tabular-nums">
              {convMTD != null ? formatPct(convMTD) : "—"}
            </CardTitle>
            <CardDescription>
              {convMTD != null
                ? `${evs.length} clients attended`
                : "No clients logged yet"}
            </CardDescription>
          </CardHeader>
        </Card>
        <Link href="/admin/marketing" className="block">
          <Card className="hover:border-primary h-full transition-colors">
            <CardHeader>
              <CardDescription>Ad ROAS · {month}</CardDescription>
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hours this week</CardTitle>
            <CardDescription>Scheduled hours per employee.</CardDescription>
          </CardHeader>
          <CardContent>
            <HoursChart data={chartData} />
          </CardContent>
        </Card>

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
