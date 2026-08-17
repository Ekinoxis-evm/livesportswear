import { formatInTimeZone } from "date-fns-tz";
import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson, formatPct, formatDuration } from "@/lib/conversion";
import { workedHours } from "@/lib/attendance";
import { normalizeStaffId } from "@/lib/shopify-range";
import { buildOrdersView } from "@/lib/orders-today";
import { OrdersToday, type OrderListRow } from "@/components/store/orders-today";
import { AttendanceToday, type AttendanceRow } from "@/components/store/attendance-today";
import { TeamTodayTable } from "@/components/store/team-today-table";
import { getDaySalesCached, getDayOrdersCached } from "@/lib/shopify-day-cache";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { spanDays } from "@/lib/date-range";
import { customRangeInTz } from "@/lib/shopify-range";
import { getStaffSalesCached } from "@/lib/shopify-range-cache";
import { formatMoney } from "@/lib/commission";
import Link from "next/link";
import { shortDate, monthLabel } from "@/lib/format-date";
import { weekdayName } from "@/lib/weekdays";
import {
  monthRows,
  periodBounds,
  resolveSalesPeriod,
  staffRowsFromEntries,
  type SalesRankRow,
} from "@/lib/sales-period";
import { PeriodPills } from "@/components/shared/period-pills";
import { SalesRankTable } from "@/components/shared/sales-rank-table";
import { GoalMeter } from "@/components/shared/goal-meter";
import { buildGoalMeter } from "@/lib/goal-meter";
import { storeGoalLevels } from "@/lib/goal-levels";
import { goalPace } from "@/lib/goal-pace";
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
import {
  ReportActions,
  type CloserEntry,
  type BlockedReason,
} from "@/components/store/report-actions";
import { StoreReportHistoryCard } from "@/components/store/report-history-card";
import { reportHistoryFor } from "@/server/conversion-core";
import { SyncSalesButton } from "@/components/shared/sync-sales-button";
import { storeSyncSales } from "@/server/store-floor";
import { resolveTiers, asTiers, commissionFor } from "@/lib/commission";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { resolveViewDay } from "@/lib/day-window";
import { DayNav } from "@/components/store/day-nav";

// Stepping to another day is a navigation, so the tab has to ride the URL or the
// rep gets bounced back to Sales on every arrow tap.
const TABS = ["sales", "orders", "attendance", "close"];

export default async function StorePerformancePage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    period?: string;
    date?: string;
    tab?: string;
  }>;
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
  const today = businessDate(tz);
  // The day being LOOKED AT. Everything day-scoped below follows it; closing the
  // day deliberately does not (see `day.isToday` at the close tab) — browsing
  // back through the week must never arm a live close on the wrong date.
  const day = resolveViewDay(sp.date, today);
  const bd = day.date;
  // Every day-scoped card says which day it means — "today" on a screen showing
  // last Tuesday is how a quiet day gets read as a disaster.
  const dayLabel = day.isToday ? "today" : `on ${weekdayName(bd)} ${shortDate(bd)}`;
  const month = bd.slice(0, 7);
  const [year, monthNum] = [Number(bd.slice(0, 4)), Number(bd.slice(5, 7))];

  // One sales table, four periods (the standard module). Anchored to TODAY, not
  // the browsed day — the period pills are their own control and shouldn't
  // shift under someone stepping back through the attendance list.
  const { mode, from, to } = resolveSalesPeriod(sp, today);

  const [
    { data: eventRows },
    { data: checkinRows },
    { data: employees },
    { data: closeRow },
    { data: shiftRows },
    { data: monthSalesRows },
    { data: goalRow },
    { data: personalGoalRows },
    { data: commissionCfg },
  ] = await Promise.all([
    service
      .from("client_events")
      .select(
        "id, employee_id, attended_at, kind, return_type, sold, got_contact, served_seconds, order_total, shopify_order_name, linked_orders, customer_name, bought_before, knew_brand",
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
    // Every shift today, published or not — the status is what tells the floor
    // WHY closing is unavailable, and a draft week is invisible otherwise.
    service
      .from("shifts")
      .select("employee_id, schedules!inner(status, location_id)")
      .eq("date", bd)
      .eq("schedules.location_id", locationId),
    service
      .from("monthly_sales")
      .select(
        "employee_id, amount, gross_amount, discounts_amount, returns_amount, tax_amount, employees!inner(location_id)",
      )
      .eq("month", month)
      .eq("employees.location_id", locationId),
    service
      .from("store_goals")
      .select("goal_amount, currency, tiers")
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
    service.from("commission_config").select("tiers").eq("id", 1).maybeSingle(),
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
      avgServedSeconds: null,
    }));
  const tableRows = [...perPerson, ...zeroRows];

  const onFloor = new Set(checkins.filter((c) => !c.left_at).map((c) => c.employee_id));
  const allShifts = shiftRows ?? [];
  const publishedShifts = allShifts.filter((s) => s.schedules?.status === "published");
  const onShift = new Set(publishedShifts.map((s) => s.employee_id));
  const closers: CloserEntry[] = roster
    .filter((e) => onShift.has(e.id) && onFloor.has(e.id))
    .map((e) => ({ id: e.id, name: e.name }));

  // Say which of the three things is actually missing, not a catch-all.
  const blockedReason: BlockedReason =
    allShifts.length === 0
      ? "nobody-scheduled"
      : publishedShifts.length === 0
        ? "unpublished"
        : "nobody-in";

  // Kick off the independent Shopify reads together — first paint waits on the
  // slowest, not the sum (all 60s-cached, so the 45s auto-refresh stays cheap).
  const staffBounds = mode !== "month" ? periodBounds(mode, { today, from, to }) : null;
  const staffRange =
    staffBounds && isShopifyConfigured()
      ? customRangeInTz(staffBounds.from, staffBounds.to, tz)
      : null;
  const [daySales, dayOrders, staffEntries, history] = await Promise.all([
    getDaySalesCached(bd, tz),
    getDayOrdersCached(bd, tz),
    staffRange
      ? getStaffSalesCached(staffRange.start, staffRange.endExclusive)
      : Promise.resolve(null),
    // DB-only, so it rides along without adding a Shopify round-trip.
    reportHistoryFor(locationId),
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
    gross: r.gross,
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
      servedSeconds: e.served_seconds,
      orderName: e.shopify_order_name,
      orderTotal: e.order_total,
      orderCount: Array.isArray(e.linked_orders)
        ? e.linked_orders.length
        : e.shopify_order_name
          ? 1
          : 0,
      customer: e.customer_name,
      boughtBefore: e.bought_before,
      knewBrand: e.knew_brand,
    }));

  // Month numbers from the synced monthly_sales table (DB-only).
  const monthTotal = (monthSalesRows ?? []).reduce((a, r) => a + Number(r.amount), 0);
  const monthGoal = goalRow ? Number(goalRow.goal_amount) : 0;
  // Commission tiers for the month (store override, else the global config).
  const tiers = resolveTiers(goalRow?.tiers, asTiers(commissionCfg?.tiers));
  const personalGoalOf = new Map(
    (personalGoalRows ?? []).map((r) => [r.employee_id, Number(r.goal_amount)]),
  );
  // Store-goal LEVELS from the commission tiers × the active team.
  const goalLevels = storeGoalLevels({
    tiers,
    activeReps: roster.length,
    storeGoal: monthGoal,
    personalGoalSum: [...personalGoalOf.values()].reduce((a, g) => a + g, 0),
  }).levels;
  // Calendar days left in the month (incl. today) — the kiosk pace basis (flat
  // calendar days, not workdays). Independent of goal/sold amounts.
  const daysLeft = goalPace(monthGoal, monthTotal, bd, month).daysLeft;
  // One meter: the store goal + its commission levels on a single bar.
  const storeMeter = buildGoalMeter({
    current: monthTotal,
    milestones: goalLevels.map((l, i) => ({
      value: l.storeTarget,
      label: i === 0 ? "Base" : `Level ${i + 1}`,
      rate: l.rate,
    })),
    goalValue: monthGoal > 0 ? monthGoal : null,
    paceDays: daysLeft,
  });

  // Per-rep rows for the active period. Today and custom pull attributed live
  // Shopify sales; the 60s range cache absorbs the kiosk's 45s auto-refresh
  // (today's range key is stable all business day).
  let rows: SalesRankRow[] = [];
  let salesUnavailable = false;
  let unmappedCount = 0;
  if (mode === "month") {
    rows = monthRows(monthSalesRows ?? [], roster, { goals: personalGoalOf });
    // Attach each rep's commission next-tier gap (the tier they're climbing to)
    // so the table shows "to next tier" + "per day" as columns.
    if (tiers.length > 0) {
      rows = rows.map((r) => {
        const next = commissionFor(r.net, tiers).nextTier;
        return {
          ...r,
          nextTier: next
            ? {
                remaining: next.remaining,
                perDay: daysLeft > 0 ? next.remaining / daysLeft : next.remaining,
                rate: next.rate,
              }
            : null,
        };
      });
    }
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
    <Tabs defaultValue={TABS.includes(sp.tab ?? "") ? sp.tab : "sales"} className="gap-4">
      <TabsList className="w-full">
        <TabsTrigger value="sales" className="h-11 flex-1">
          Sales
        </TabsTrigger>
        <TabsTrigger value="orders" className="h-11 flex-1">
          Orders
        </TabsTrigger>
        <TabsTrigger value="attendance" className="h-11 flex-1">
          Attendance
        </TabsTrigger>
        <TabsTrigger value="close" className="h-11 flex-1">
          Close day
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sales" className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Net sales {dayLabel}</CardDescription>
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
            <CardDescription>Orders {dayLabel}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {ordersView ? ordersView.total.orders : daySales ? daySales.orders : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* One sales table, switchable period (the standard module) */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-base">Sales</CardTitle>
            <SyncSalesButton action={storeSyncSales} />
          </div>
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

          {mode === "month" &&
            (storeMeter ? (
              <GoalMeter
                model={storeMeter}
                currency={currency}
                title="Store sales so far"
              />
            ) : (
              <div className="flex items-end justify-between gap-3">
                <span className="flex flex-col">
                  <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
                    Sales so far
                  </span>
                  <span className="text-2xl font-bold tabular-nums">
                    {formatMoney(monthTotal, currency)}
                  </span>
                </span>
                <span className="text-muted-foreground text-sm">no goal set</span>
              </div>
            ))}

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
              showNextTier={mode === "month" && tiers.length > 0}
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
      </TabsContent>

      <TabsContent value="orders" className="flex flex-col gap-5">
      <DayNav date={bd} prev={day.prev} next={day.next} tab="orders" />
      {ordersView ? (
        <OrdersToday
          total={ordersView.total}
          perPerson={ordersView.perPerson}
          rows={orderListRows}
          currency={currency}
        />
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            No orders {dayLabel}.
          </CardContent>
        </Card>
      )}
      </TabsContent>

      <TabsContent value="attendance" className="flex flex-col gap-5">
      <DayNav date={bd} prev={day.prev} next={day.next} tab="attendance" />
      {/* Per-employee table first, with the day totals as a strip on its header —
          the totals ARE the sum of the per-person rows, so they read as one. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {day.isToday ? "Team today" : "Team that day"}
          </CardTitle>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            {(
              [
                ["Attended", String(t.attended)],
                ["Sold", String(t.sold)],
                ["Conversion", t.attended > 0 ? formatPct(t.conversion) : "—"],
                ["Contacts", String(t.contacts)],
                ["Avg time", formatDuration(t.avgServedSeconds)],
              ] as const
            ).map(([label, value]) => (
              <span key={label} className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tabular-nums">{value}</span>
                <span className="text-muted-foreground text-xs uppercase tracking-wide">
                  {label}
                </span>
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {tableRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nobody has checked in yet.</p>
          ) : (
            <TeamTodayTable
              rows={tableRows.map((p) => ({
                employeeId: p.employeeId,
                name: nameOf.get(p.employeeId) ?? "—",
                attended: p.attended,
                sold: p.sold,
                conversion: p.conversion,
                returns: p.returns,
                avgSeconds: p.avgServedSeconds,
                hours: hoursOf.get(p.employeeId) ?? null,
              }))}
            />
          )}
        </CardContent>
      </Card>

      {t.returns > 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-3 text-sm">
            Returns {dayLabel}:{" "}
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
      </TabsContent>

      <TabsContent value="close" className="flex flex-col gap-4">
      {/* Just the two buttons — no email block. Recipients are step 1 of the
          wizard each button opens, editable per send. */}
      {/* Closing always means TODAY. While a past day is being browsed the live
          buttons are gone entirely — a resend for that day belongs to the
          history table below, which is the honest tool for it. */}
      {day.isToday ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-5">
            <span className="text-sm font-medium">End of day</span>
            <ReportActions
              closers={closers}
              alreadyClosed={Boolean(closeRow)}
              blockedReason={blockedReason}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col gap-2 py-5 text-sm">
            <span>
              You&rsquo;re looking at {weekdayName(bd)} {shortDate(bd)}. Closing the
              day is only ever today&rsquo;s job.
            </span>
            <Link
              href="/store/performance?tab=close"
              prefetch={false}
              className="text-foreground font-medium underline underline-offset-4"
            >
              Back to today
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reports sent</CardTitle>
          <CardDescription>
            The last two weeks. Any day worked without a report can be sent from
            here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StoreReportHistoryCard rows={history} currency={currency} />
        </CardContent>
      </Card>
      </TabsContent>
    </Tabs>
  );
}
