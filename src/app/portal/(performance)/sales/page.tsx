import { formatInTimeZone } from "date-fns-tz";
import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { addDays } from "@/lib/scheduling/week";
import { spanDays } from "@/lib/date-range";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { customRangeInTz, normalizeStaffId } from "@/lib/shopify-range";
import { getStaffSalesCached } from "@/lib/shopify-range-cache";
import { getRangeOrdersCached } from "@/lib/shopify-day-cache";
import { isPosOrder } from "@/lib/orders-today";
import {
  personalOrderStats,
  type DayTally,
  type PersonalOrder,
} from "@/lib/personal-stats";
import {
  periodBounds,
  resolveSalesPeriod,
  type SalesPeriod,
} from "@/lib/sales-period";
import { formatMoney } from "@/lib/commission";
import { shortDate, monthLabel } from "@/lib/format-date";
import { zeroBreakdown, type SalesBreakdown } from "@/lib/sales-breakdown";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PeriodPills } from "@/components/shared/period-pills";
import { SalesBreakdownBlock } from "@/components/shared/sales-breakdown-view";
import { Stat, StatGrid } from "@/components/portal/stats";
import { DayBars } from "@/components/portal/day-bars";

// Past this many days the per-day bars stop being readable (and the Shopify
// pagination starts to hurt) — the numbers still work, the chart drops out.
const MAX_BAR_DAYS = 62;

const PERIODS: SalesPeriod[] = ["today", "week", "month", "custom"];

/** Every day in the period, zeros included, so gaps in the bars are honest. */
function zeroFill(tallies: DayTally[], from: string, to: string): DayTally[] {
  const byDay = new Map(tallies.map((t) => [t.day, t]));
  const out: DayTally[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(byDay.get(d) ?? { day: d, orders: 0, net: 0 });
  }
  return out;
}

export default async function PortalSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const { employee } = await requireEmployee();
  const supabase = await createServerClient();

  const [{ data: location }, { data: cfg }] = await Promise.all([
    supabase
      .from("locations")
      .select("timezone")
      .eq("id", employee.location_id)
      .maybeSingle(),
    supabase.from("commission_config").select("currency").eq("id", 1).maybeSingle(),
  ]);
  const tz = location?.timezone ?? "UTC";
  const currency = cfg?.currency ?? "USD";
  const today = businessDate(tz);
  const month = today.slice(0, 7);

  // Month-to-date is the number a rep actually tracks — Today is a thin default here.
  const { mode, from, to } = resolveSalesPeriod(sp, today, PERIODS, "month");
  const bounds = periodBounds(mode, { today, from, to });
  const days = spanDays(bounds.from, bounds.to);

  const myStaffId = employee.shopify_staff_id
    ? normalizeStaffId(employee.shopify_staff_id)
    : null;
  const configured = isShopifyConfigured() && myStaffId !== null;
  const range = configured ? customRangeInTz(bounds.from, bounds.to, tz) : null;

  const [entries, orders] = await Promise.all([
    range ? getStaffSalesCached(range.start, range.endExclusive) : Promise.resolve(null),
    range ? getRangeOrdersCached(range.start, range.endExclusive) : Promise.resolve(null),
  ]);

  const breakdown: SalesBreakdown | null = entries
    ? (new Map(entries).get(myStaffId as string) ?? zeroBreakdown())
    : null;

  const myOrders: PersonalOrder[] = (orders ?? [])
    .filter((o) => isPosOrder(o) && o.staffId && normalizeStaffId(o.staffId) === myStaffId)
    .map((o) => ({
      day: formatInTimeZone(new Date(o.createdAt), tz, "yyyy-MM-dd"),
      net: o.net,
      customerId: o.customer?.id ?? null,
      customerCreatedDay: o.customer?.createdAt
        ? formatInTimeZone(new Date(o.customer.createdAt), tz, "yyyy-MM-dd")
        : null,
    }));
  const stats = personalOrderStats(myOrders);

  // Rank among the store's Shopify-mapped team for this same period.
  const service = createServiceClient();
  const { data: roster } = await service
    .from("employees")
    .select("shopify_staff_id")
    .eq("location_id", employee.location_id)
    .eq("active", true)
    .not("shopify_staff_id", "is", null);
  const byStaff = new Map(entries ?? []);
  const teamStaffIds = (roster ?? []).map((e) =>
    normalizeStaffId(e.shopify_staff_id as string),
  );
  const myNet = breakdown?.net ?? 0;
  const rank =
    teamStaffIds.filter((id) => (byStaff.get(id)?.net ?? 0) > myNet).length + 1;

  const unavailable = configured && (entries === null || orders === null);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">My sales</CardTitle>
          <CardDescription>
            {mode === "custom"
              ? `${shortDate(bounds.from)} – ${shortDate(bounds.to)} · ${days}d`
              : mode === "today"
                ? "Today, live from Shopify"
                : mode === "week"
                  ? "This week so far"
                  : `${monthLabel(month)} so far`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <PeriodPills
            basePath="/portal/sales"
            mode={mode}
            from={from}
            to={to}
            defaultPeriod="month"
            labels={{ month: monthLabel(month) }}
          />

          {myStaffId === null ? (
            <p className="text-muted-foreground text-sm">
              Ask your admin to link your Shopify profile to see your sales here.
            </p>
          ) : !isShopifyConfigured() || unavailable ? (
            <p className="text-muted-foreground text-sm">
              Sales are unavailable right now.
            </p>
          ) : (
            <>
              {breakdown && (
                <SalesBreakdownBlock
                  sales={breakdown}
                  currency={currency}
                  className="max-w-xs"
                />
              )}

              <StatGrid>
                <Stat label="Orders" value={String(stats.orders)} />
                <Stat
                  label="Average ticket"
                  value={formatMoney(stats.avgTicket, currency)}
                />
                <Stat
                  label="Largest sale"
                  value={formatMoney(stats.largestSale, currency)}
                />
                <Stat
                  label="Rank at your store"
                  value={`#${rank}`}
                  hint={`of ${teamStaffIds.length}`}
                />
                <Stat label="Days selling" value={String(stats.daysWithSales)} />
                <Stat
                  label="Average per selling day"
                  value={formatMoney(stats.avgPerSellingDay, currency)}
                />
              </StatGrid>
            </>
          )}
        </CardContent>
      </Card>

      {stats.orders > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Records</CardTitle>
            <CardDescription>Your bests within this period.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <StatGrid className="sm:grid-cols-2">
              <Stat
                label="Best day"
                value={formatMoney(stats.bestDay?.net ?? 0, currency)}
                hint={stats.bestDay ? shortDate(stats.bestDay.day) : undefined}
              />
              <Stat
                label="Most orders in a day"
                value={String(stats.maxOrdersDay?.orders ?? 0)}
                hint={stats.maxOrdersDay ? shortDate(stats.maxOrdersDay.day) : undefined}
              />
            </StatGrid>

            {days <= MAX_BAR_DAYS && (
              <DayBars
                days={zeroFill(stats.byDay, bounds.from, bounds.to)}
                currency={currency}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
