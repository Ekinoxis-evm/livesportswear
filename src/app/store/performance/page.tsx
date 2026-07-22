import { formatInTimeZone } from "date-fns-tz";
import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson, formatPct } from "@/lib/conversion";
import { workedHours } from "@/lib/attendance";
import { normalizeStaffId } from "@/lib/shopify-range";
import { buildOrdersView } from "@/lib/orders-today";
import { OrdersToday, type OrderListRow } from "@/components/store/orders-today";
import { AttendanceToday, type AttendanceRow } from "@/components/store/attendance-today";
import { getDaySalesCached, getDayOrdersCached } from "@/lib/shopify-day-cache";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { spanDays } from "@/lib/date-range";
import { customRangeInTz } from "@/lib/shopify-range";
import { getStaffSalesCached } from "@/lib/shopify-range-cache";
import { formatMoney } from "@/lib/commission";
import { shortDate, monthLabel } from "@/lib/format-date";
import {
  monthRows,
  periodBounds,
  resolveSalesPeriod,
  staffRowsFromEntries,
  type SalesRankRow,
} from "@/lib/sales-period";
import { PeriodPills } from "@/components/shared/period-pills";
import { SalesRankTable } from "@/components/shared/sales-rank-table";
import { ScrollTable } from "@/components/shared/scroll-table";
import {
  SalesBreakdownBlock,
  SalesBreakdownSubline,
} from "@/components/shared/sales-breakdown-view";
import { sumBreakdowns, type SalesBreakdown } from "@/lib/sales-breakdown";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReportActions, type CloserEntry } from "@/components/store/report-actions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default async function StorePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
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

  // One sales table, four periods (the standard module).
  const { mode, from, to } = resolveSalesPeriod(sp, bd);

  const [
    { data: eventRows },
    { data: checkinRows },
    { data: employees },
    { data: closeRow },
    { data: shiftRows },
    { data: monthSalesRows },
    { data: goalRow },
    { data: personalGoalRows },
  ] = await Promise.all([
    service
      .from("client_events")
      .select(
        "id, employee_id, attended_at, kind, return_type, sold, got_contact, order_total, shopify_order_name, customer_name",
      )
      .eq("location_id", locationId)
      .eq("business_date", bd),
    service
      .from("floor_checkins")
      .select("employee_id, arrived_at, left_at")
      .eq("location_id", locationId)
      .eq("business_date", bd),
    service
      .from("employees")
      .select("id, name, shopify_staff_id")
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
      .select(
        "employee_id, amount, gross_amount, discounts_amount, returns_amount, employees!inner(location_id)",
      )
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

  // Kick off the independent Shopify reads together — first paint waits on the
  // slowest, not the sum (all 60s-cached, so the 45s auto-refresh stays cheap).
  const staffBounds = mode !== "month" ? periodBounds(mode, { today: bd, from, to }) : null;
  const staffRange =
    staffBounds && isShopifyConfigured()
      ? customRangeInTz(staffBounds.from, staffBounds.to, tz)
      : null;
  const [daySales, dayOrders, staffEntries] = await Promise.all([
    getDaySalesCached(bd, tz),
    getDayOrdersCached(bd, tz),
    staffRange
      ? getStaffSalesCached(staffRange.start, staffRange.endExclusive)
      : Promise.resolve(null),
  ]);
  const currency = goalRow?.currency ?? daySales?.currency ?? "USD";


  // Today's orders split by channel (POS vs online) + per-seller avg ticket.
  const staffToName = new Map<string, string>();
  for (const e of roster) {
    if (e.shopify_staff_id) staffToName.set(normalizeStaffId(e.shopify_staff_id), e.name);
  }
  const ordersView = dayOrders ? buildOrdersView(dayOrders, staffToName) : null;
  const orderListRows: OrderListRow[] = (ordersView?.rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    time: formatInTimeZone(new Date(r.createdAt), tz, "HH:mm"),
    seller: r.sellerName,
    net: r.net,
  }));

  // The attendance list: every client logged on the floor today, newest first.
  const attendanceRows: AttendanceRow[] = [...events]
    .sort((a, b) => (b.attended_at ?? "").localeCompare(a.attended_at ?? ""))
    .map((e) => ({
      id: e.id,
      time: formatInTimeZone(new Date(e.attended_at), tz, "HH:mm"),
      rep: nameOf.get(e.employee_id) ?? "—",
      isReturn: e.kind === "return",
      returnType: e.return_type,
      sold: e.sold,
      gotContact: e.got_contact,
      orderName: e.shopify_order_name,
      orderTotal: e.order_total,
      customer: e.customer_name,
    }));

  // Month numbers from the synced monthly_sales table (DB-only).
  const monthTotal = (monthSalesRows ?? []).reduce((a, r) => a + Number(r.amount), 0);
  const monthGoal = goalRow ? Number(goalRow.goal_amount) : 0;
  const personalGoalOf = new Map(
    (personalGoalRows ?? []).map((r) => [r.employee_id, Number(r.goal_amount)]),
  );

  // Per-rep rows for the active period. Today and custom pull attributed live
  // Shopify sales; the 60s range cache absorbs the kiosk's 45s auto-refresh
  // (today's range key is stable all business day).
  let rows: SalesRankRow[] = [];
  let salesUnavailable = false;
  let unmappedCount = 0;
  if (mode === "month") {
    rows = monthRows(monthSalesRows ?? [], roster, { goals: personalGoalOf });
  } else if (isShopifyConfigured()) {
    unmappedCount = roster.filter((e) => !e.shopify_staff_id).length;
    if (staffEntries) {
      rows = staffRowsFromEntries(staffEntries, roster);
    } else {
      salesUnavailable = true;
    }
  } else {
    salesUnavailable = true;
  }
  const periodTotal = sumBreakdowns(
    rows.map((r) => r.breakdown).filter((b): b is SalesBreakdown => b !== null),
  );

  return (
    <Tabs defaultValue="sales" className="gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="sales" className="h-11 flex-1">
          Sales
        </TabsTrigger>
        <TabsTrigger value="clients" className="h-11 flex-1">
          Clients
        </TabsTrigger>
        <TabsTrigger value="close" className="h-11 flex-1">
          Close day
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sales" className="flex flex-col gap-5">
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
              {ordersView ? ordersView.total.orders : daySales ? daySales.orders : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* One sales table, switchable period (the standard module) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales</CardTitle>
          <CardDescription>
            {mode === "month"
              ? "Net sales (synced from Shopify)"
              : mode === "custom"
                ? `${shortDate(from)} – ${shortDate(to)} · ${spanDays(from, to)}d · attributed to this store's team`
                : "Attributed to this store's team, live from Shopify"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PeriodPills
            basePath="/store/performance"
            mode={mode}
            from={from}
            to={to}
            labels={{ month: monthLabel(month) }}
          />

          {mode === "month" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-2xl font-bold tabular-nums">
                  {formatMoney(monthTotal, currency)}
                </span>
                {monthGoal > 0 ? (
                  <span className="text-muted-foreground text-sm tabular-nums">
                    goal {formatMoney(monthGoal, currency)} ·{" "}
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
                    style={{ width: `${Math.min((monthTotal / monthGoal) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {mode !== "month" &&
            (salesUnavailable ? (
              <p className="text-muted-foreground text-sm">
                Sales are unavailable right now.
              </p>
            ) : (
              <SalesBreakdownBlock
                sales={periodTotal}
                currency={currency}
                className="max-w-xs"
              />
            ))}

          {rows.length > 0 && (
            <SalesRankTable
              rows={rows}
              currency={currency}
              showGoal={mode === "month"}
              density="comfortable"
            />
          )}

          {mode !== "month" && unmappedCount > 0 && (
            <p className="text-muted-foreground text-xs">
              {unmappedCount} team member{unmappedCount === 1 ? "" : "s"} without a
              Shopify staff mapping {unmappedCount === 1 ? "doesn't" : "don't"} appear
              here.
            </p>
          )}
        </CardContent>
      </Card>

      {ordersView && (
        <OrdersToday
          total={ordersView.total}
          perPerson={ordersView.perPerson}
          rows={orderListRows}
          currency={currency}
        />
      )}
      </TabsContent>

      <TabsContent value="clients" className="flex flex-col gap-5">
      {/* Clients attended */}
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

      <AttendanceToday rows={attendanceRows} currency={currency} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team today</CardTitle>
        </CardHeader>
        <CardContent>
          {tableRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nobody has checked in yet.</p>
          ) : (
            <ScrollTable density="comfortable">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left">
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
            </ScrollTable>
          )}
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="close" className="flex flex-col gap-4">
      {/* Just the two buttons — no email block. Recipients are step 1 of the
          wizard each button opens, editable per send. */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-5">
          <span className="text-sm font-medium">End of day</span>
          <ReportActions closers={closers} alreadyClosed={Boolean(closeRow)} />
        </CardContent>
      </Card>
      </TabsContent>
    </Tabs>
  );
}
