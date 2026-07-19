import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson, formatPct } from "@/lib/conversion";
import { workedHours } from "@/lib/attendance";
import { getDaySalesCached } from "@/lib/shopify-day-cache";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { resolveDateRange, spanDays } from "@/lib/date-range";
import { customRangeInTz, normalizeStaffId } from "@/lib/shopify-range";
import { getStaffSalesCached } from "@/lib/shopify-range-cache";
import { formatMoney } from "@/lib/commission";
import { shortDate, monthLabel } from "@/lib/format-date";
import { DateRangeForm } from "@/components/shared/date-range-form";
import {
  SalesBreakdownBlock,
  SalesBreakdownSubline,
} from "@/components/shared/sales-breakdown-view";
import { sumBreakdowns, zeroBreakdown, type SalesBreakdown } from "@/lib/sales-breakdown";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CloseDayDialog,
  type CloserEntry,
} from "@/components/store/close-day-dialog";

export default async function StorePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const { locationId } = await requireStore();
  const service = createServiceClient();

  const { data: loc } = await service
    .from("locations")
    .select("timezone")
    .eq("id", locationId)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  const bd = businessDate(tz);
  const month = bd.slice(0, 7);
  const [year, monthNum] = [Number(bd.slice(0, 4)), Number(bd.slice(5, 7))];

  const [
    { data: eventRows },
    { data: checkinRows },
    { data: employees },
    { data: closeRow },
    { data: shiftRows },
    { data: monthRows },
    { data: goalRow },
    { data: personalGoalRows },
  ] = await Promise.all([
    service
      .from("client_events")
      .select("employee_id, kind, sold, got_contact")
      .eq("location_id", locationId)
      .eq("business_date", bd),
    service
      .from("floor_checkins")
      .select("employee_id, arrived_at, left_at")
      .eq("location_id", locationId)
      .eq("business_date", bd),
    service
      .from("employees")
      .select("id, name")
      .eq("location_id", locationId)
      .eq("active", true)
      .order("name"),
    service
      .from("store_day_closes")
      .select("id")
      .eq("location_id", locationId)
      .eq("business_date", bd)
      .maybeSingle(),
    service
      .from("shifts")
      .select("employee_id, schedules!inner(status, location_id)")
      .eq("date", bd)
      .eq("schedules.status", "published")
      .eq("schedules.location_id", locationId),
    service
      .from("monthly_sales")
      .select("employee_id, amount, employees!inner(location_id)")
      .eq("month", month)
      .eq("employees.location_id", locationId),
    service
      .from("store_goals")
      .select("goal_amount, currency")
      .eq("location_id", locationId)
      .eq("year", year)
      .eq("month", monthNum)
      .maybeSingle(),
    service
      .from("employee_goals")
      .select("employee_id, goal_amount, employees!inner(location_id)")
      .eq("year", year)
      .eq("month", monthNum)
      .eq("employees.location_id", locationId),
  ]);

  const roster = employees ?? [];
  const nameOf = new Map(roster.map((e) => [e.id, e.name]));
  const events = eventRows ?? [];
  const checkins = checkinRows ?? [];

  const t = totals(events);
  const perPerson = byPerson(events);
  const hoursOf = new Map(
    checkins.map((c) => [c.employee_id, workedHours(c.arrived_at, c.left_at)]),
  );

  // Everyone who checked in today appears, zeros included.
  const withEvents = new Set(perPerson.map((p) => p.employeeId));
  const zeroRows = checkins
    .filter((c) => !withEvents.has(c.employee_id))
    .map((c) => ({
      employeeId: c.employee_id,
      attended: 0,
      sold: 0,
      contacts: 0,
      conversion: 0,
      contactRate: 0,
      returns: 0,
      returnExtraSales: 0,
    }));
  const tableRows = [...perPerson, ...zeroRows];

  const onFloor = new Set(checkins.filter((c) => !c.left_at).map((c) => c.employee_id));
  const onShift = new Set((shiftRows ?? []).map((s) => s.employee_id));
  const closers: CloserEntry[] = roster
    .filter((e) => onShift.has(e.id) && onFloor.has(e.id))
    .map((e) => ({ id: e.id, name: e.name }));

  const daySales = await getDaySalesCached(bd, tz);

  // This month, from the synced monthly_sales table (DB-only — safe on the
  // 45s refresh; Shopify itself is never called here).
  const monthAmountOf = new Map(
    (monthRows ?? []).map((r) => [r.employee_id, Number(r.amount)]),
  );
  const monthTotal = [...monthAmountOf.values()].reduce((a, v) => a + v, 0);
  const monthGoal = goalRow ? Number(goalRow.goal_amount) : 0;
  const monthCurrency = goalRow?.currency ?? daySales?.currency ?? "USD";
  const personalGoalOf = new Map(
    (personalGoalRows ?? []).map((r) => [r.employee_id, Number(r.goal_amount)]),
  );
  const monthReps = roster
    .map((e) => ({
      name: e.name,
      amount: monthAmountOf.get(e.id) ?? 0,
      goal: personalGoalOf.get(e.id) ?? null,
    }))
    .filter((r) => r.amount > 0 || r.goal != null)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  // Range section only fetches when the kiosk asked for a range — the default
  // 45s auto-refresh loop must not add Shopify calls.
  const hasRange = Boolean(sp.from || sp.to);
  const { from, to } = resolveDateRange(sp, bd);
  let rangeRows: { name: string; sales: SalesBreakdown }[] | null = null;
  if (hasRange && isShopifyConfigured()) {
    const range = customRangeInTz(from, to, tz);
    const [entries, { data: mapped }] = await Promise.all([
      getStaffSalesCached(range.start, range.endExclusive),
      service
        .from("employees")
        .select("name, shopify_staff_id")
        .eq("location_id", locationId)
        .eq("active", true)
        .not("shopify_staff_id", "is", null),
    ]);
    if (entries) {
      const byStaff = new Map(entries);
      rangeRows = (mapped ?? [])
        .map((e) => ({
          name: e.name,
          sales:
            byStaff.get(normalizeStaffId(e.shopify_staff_id as string)) ??
            zeroBreakdown(),
        }))
        .sort((a, b) => b.sales.net - a.sales.net || a.name.localeCompare(b.name));
    }
  }
  const rangeTotal = sumBreakdowns((rangeRows ?? []).map((r) => r.sales));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardDescription>Net sales today</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {daySales ? formatMoney(daySales.net, daySales.currency ?? "USD") : "—"}
            </CardTitle>
          </CardHeader>
          {daySales && (
            <CardContent className="pt-0">
              <SalesBreakdownSubline sales={daySales} currency={daySales.currency} />
            </CardContent>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Orders today</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {daySales ? daySales.orders : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Attended</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{t.attended}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Sold</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{t.sold}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Conversion</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {t.attended > 0 ? formatPct(t.conversion) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Contacts</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{t.contacts}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {t.returns > 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-3 text-sm">
            Returns today:{" "}
            <span className="text-foreground font-semibold tabular-nums">{t.returns}</span>
            {" · "}
            <span className="text-foreground font-semibold tabular-nums">
              {t.returnExtraSales}
            </span>{" "}
            converted to an extra sale
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{monthLabel(month)}</CardTitle>
          <CardDescription>Net sales (synced from Shopify)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-2xl font-bold tabular-nums">
                {formatMoney(monthTotal, monthCurrency)}
              </span>
              {monthGoal > 0 ? (
                <span className="text-muted-foreground text-sm tabular-nums">
                  goal {formatMoney(monthGoal, monthCurrency)} ·{" "}
                  <span
                    className={
                      monthTotal >= monthGoal
                        ? "font-semibold text-emerald-600"
                        : "text-foreground font-semibold"
                    }
                  >
                    {Math.round((monthTotal / monthGoal) * 100)}%
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground text-sm">no goal set</span>
              )}
            </div>
            {monthGoal > 0 && (
              <div
                className="bg-muted h-2.5 w-full overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={Math.min(Math.round((monthTotal / monthGoal) * 100), 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Store monthly goal progress"
              >
                <div
                  className={
                    monthTotal >= monthGoal ? "h-full bg-emerald-500" : "bg-primary h-full"
                  }
                  style={{
                    width: `${Math.min((monthTotal / monthGoal) * 100, 100)}%`,
                  }}
                />
              </div>
            )}
          </div>

          {monthReps.length > 0 && (
            <ul className="flex flex-col divide-y">
              {monthReps.map((r, i) => (
                <li key={r.name} className="flex flex-col gap-1 py-2">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="text-muted-foreground mr-2 tabular-nums">
                        {i + 1}.
                      </span>
                      <span className="font-medium">{r.name}</span>
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(r.amount, monthCurrency)}
                      {r.goal != null && r.goal > 0 && (
                        <span
                          className={
                            r.amount >= r.goal
                              ? "ml-2 font-semibold text-emerald-600"
                              : "text-muted-foreground ml-2"
                          }
                        >
                          {Math.round((r.amount / r.goal) * 100)}% of{" "}
                          {formatMoney(r.goal, monthCurrency)}
                        </span>
                      )}
                    </span>
                  </div>
                  {r.goal != null && r.goal > 0 && (
                    <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={
                          r.amount >= r.goal ? "h-full bg-emerald-500" : "bg-primary h-full"
                        }
                        style={{ width: `${Math.min((r.amount / r.goal) * 100, 100)}%` }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team today</CardTitle>
        </CardHeader>
        <CardContent>
          {tableRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nobody has checked in yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 font-medium">Employee</th>
                    <th className="py-2 text-right font-medium">Attended</th>
                    <th className="py-2 text-right font-medium">Sold</th>
                    <th className="py-2 text-right font-medium">Conversion</th>
                    <th className="py-2 text-right font-medium">Returns</th>
                    <th className="py-2 text-right font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((p) => (
                    <tr key={p.employeeId} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        {nameOf.get(p.employeeId) ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">{p.attended}</td>
                      <td className="py-2 text-right tabular-nums">{p.sold}</td>
                      <td className="py-2 text-right tabular-nums">
                        {p.attended > 0 ? formatPct(p.conversion) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {p.returns > 0 ? p.returns : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {hoursOf.get(p.employeeId) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales for a range</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DateRangeForm from={from} to={to} action="/store/performance" />
          {hasRange &&
            (rangeRows === null ? (
              <p className="text-muted-foreground text-sm">
                Sales are unavailable right now.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  {shortDate(from)} – {shortDate(to)} · {spanDays(from, to)}d
                  (attributed to this store&apos;s team)
                </p>
                <SalesBreakdownBlock
                  sales={rangeTotal}
                  currency={daySales?.currency}
                  className="max-w-xs"
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left">
                        <th className="py-2 font-medium">#</th>
                        <th className="py-2 font-medium">Employee</th>
                        <th className="py-2 text-right font-medium">Value</th>
                        <th className="py-2 text-right font-medium">Discounts</th>
                        <th className="py-2 text-right font-medium">Returns</th>
                        <th className="py-2 text-right font-medium">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rangeRows.map((r, i) => (
                        <tr key={r.name} className="border-b last:border-0">
                          <td className="text-muted-foreground py-2 tabular-nums">
                            {i + 1}
                          </td>
                          <td className="py-2 font-medium">{r.name}</td>
                          <td className="text-muted-foreground py-2 text-right tabular-nums">
                            {formatMoney(r.sales.gross, daySales?.currency ?? "USD")}
                          </td>
                          <td className="text-muted-foreground py-2 text-right tabular-nums">
                            {r.sales.discounts > 0
                              ? `−${formatMoney(r.sales.discounts, daySales?.currency ?? "USD")}`
                              : "—"}
                          </td>
                          <td className="text-muted-foreground py-2 text-right tabular-nums">
                            {r.sales.returns > 0
                              ? `−${formatMoney(r.sales.returns, daySales?.currency ?? "USD")}`
                              : "—"}
                          </td>
                          <td className="py-2 text-right font-semibold tabular-nums">
                            {formatMoney(r.sales.net, daySales?.currency ?? "USD")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <span className="text-sm font-medium">End of day</span>
          <CloseDayDialog closers={closers} alreadyClosed={Boolean(closeRow)} />
        </CardContent>
      </Card>
    </div>
  );
}
