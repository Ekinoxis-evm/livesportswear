import { formatInTimeZone } from "date-fns-tz";
import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { businessDate } from "@/lib/business-date";
import { spanDays } from "@/lib/date-range";
import { totals, formatPct } from "@/lib/conversion";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { customRangeInTz, normalizeStaffId } from "@/lib/shopify-range";
import { getRangeOrdersCached } from "@/lib/shopify-day-cache";
import { isPosOrder } from "@/lib/orders-today";
import { personalClientStats, type PersonalOrder } from "@/lib/personal-stats";
import {
  periodBounds,
  resolveSalesPeriod,
  type SalesPeriod,
} from "@/lib/sales-period";
import { formatMoney } from "@/lib/commission";
import { shortDate, monthLabel } from "@/lib/format-date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PeriodPills } from "@/components/shared/period-pills";
import { ScrollTable } from "@/components/shared/scroll-table";
import { Stat, StatGrid } from "@/components/portal/stats";

const PERIODS: SalesPeriod[] = ["today", "week", "month", "custom"];

type MyEvent = {
  employee_id: string;
  business_date: string;
  sold: boolean;
  got_contact: boolean;
  kind: string | null;
  shopify_customer_id: string | null;
  customer_name: string | null;
  order_total: number | string | null;
};

export default async function PortalClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const { employee } = await requireEmployee();
  const supabase = await createServerClient();

  const [{ data: location }, { data: cfg }, { data: eventRows }] = await Promise.all([
    supabase
      .from("locations")
      .select("timezone")
      .eq("id", employee.location_id)
      .maybeSingle(),
    supabase.from("commission_config").select("currency").eq("id", 1).maybeSingle(),
    // RLS (client_events_self_read) limits this to the rep's own events.
    supabase
      .from("client_events")
      .select(
        "employee_id, business_date, sold, got_contact, kind, shopify_customer_id, customer_name, order_total",
      )
      .eq("employee_id", employee.id)
      .order("attended_at"),
  ]);
  const tz = location?.timezone ?? "UTC";
  const currency = cfg?.currency ?? "USD";
  const today = businessDate(tz);
  const month = today.slice(0, 7);

  const { mode, from, to } = resolveSalesPeriod(sp, today, PERIODS, "month");
  const bounds = periodBounds(mode, { today, from, to });

  const events = (eventRows ?? []) as MyEvent[];
  const allTime = totals(events);
  const inPeriod = totals(
    events.filter(
      (e) => e.business_date >= bounds.from && e.business_date <= bounds.to,
    ),
  );

  // Clients this rep captured — first event with the contact wins, the same
  // rule /admin/clients uses. Name and dates only: contact details stay out of
  // the portal (security.md).
  const captured = new Map<
    string,
    { name: string; visits: number; linkedTotal: number; lastSeen: string }
  >();
  for (const e of events) {
    if (!e.shopify_customer_id) continue;
    const existing = captured.get(e.shopify_customer_id);
    if (!existing && !e.got_contact) continue;
    const row = existing ?? {
      name: e.customer_name ?? "Customer",
      visits: 0,
      linkedTotal: 0,
      lastSeen: e.business_date,
    };
    row.visits += 1;
    row.linkedTotal += Number(e.order_total ?? 0);
    row.lastSeen = e.business_date;
    if (e.customer_name) row.name = e.customer_name;
    captured.set(e.shopify_customer_id, row);
  }
  const capturedList = [...captured.entries()]
    .map(([customerId, row]) => ({ customerId, ...row }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));

  // New vs repeat clients over the period, from the rep's POS orders.
  const myStaffId = employee.shopify_staff_id
    ? normalizeStaffId(employee.shopify_staff_id)
    : null;
  const range =
    myStaffId && isShopifyConfigured()
      ? customRangeInTz(bounds.from, bounds.to, tz)
      : null;
  const orders = range
    ? await getRangeOrdersCached(range.start, range.endExclusive)
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
  const clients = personalClientStats(myOrders, bounds);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clients &amp; conversion</CardTitle>
          <CardDescription>
            {mode === "custom"
              ? `${shortDate(bounds.from)} – ${shortDate(bounds.to)} · ${spanDays(bounds.from, bounds.to)}d`
              : mode === "today"
                ? "Today"
                : mode === "week"
                  ? "This week so far"
                  : `${monthLabel(month)} so far`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <PeriodPills
            basePath="/portal/clients"
            mode={mode}
            from={from}
            to={to}
            defaultPeriod="month"
            labels={{ month: monthLabel(month) }}
          />

          <StatGrid>
            <Stat label="Attended" value={String(inPeriod.attended)} />
            <Stat label="Sold" value={String(inPeriod.sold)} />
            <Stat
              label="Conversion"
              value={inPeriod.attended > 0 ? formatPct(inPeriod.conversion) : "—"}
            />
            <Stat label="Contacts captured" value={String(inPeriod.contacts)} />
            <Stat label="Returns handled" value={String(inPeriod.returns)} />
            <Stat
              label="Returns that bought more"
              value={String(inPeriod.returnExtraSales)}
            />
          </StatGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clients in Shopify</CardTitle>
          <CardDescription>
            A client counts as new when their Shopify record was created inside
            this period — Shopify doesn&apos;t record who created it, so this
            follows the sale.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {myStaffId === null ? (
            <p className="text-muted-foreground text-sm">
              Ask your admin to link your Shopify profile to see this.
            </p>
          ) : orders === null ? (
            <p className="text-muted-foreground text-sm">
              Shopify is unavailable right now.
            </p>
          ) : (
            <StatGrid>
              <Stat label="Clients served" value={String(clients.customersServed)} />
              <Stat label="New clients" value={String(clients.newClients)} />
              <Stat label="Returning clients" value={String(clients.repeatClients)} />
            </StatGrid>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All time</CardTitle>
          <CardDescription>Every client you&apos;ve logged on the floor.</CardDescription>
        </CardHeader>
        <CardContent>
          <StatGrid>
            <Stat label="Attended" value={String(allTime.attended)} />
            <Stat label="Sold" value={String(allTime.sold)} />
            <Stat
              label="Conversion"
              value={allTime.attended > 0 ? formatPct(allTime.conversion) : "—"}
            />
            <Stat label="Contacts captured" value={String(allTime.contacts)} />
            <Stat label="Clients on file" value={String(capturedList.length)} />
            <Stat label="Returns handled" value={String(allTime.returns)} />
          </StatGrid>
        </CardContent>
      </Card>

      {capturedList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clients you signed up</CardTitle>
            <CardDescription>
              Contacts you captured at the kiosk, newest first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-2 font-medium">Client</th>
                    <th className="py-2 text-right font-medium">Visits</th>
                    <th className="hidden py-2 text-right font-medium sm:table-cell">
                      Linked sales
                    </th>
                    <th className="py-2 text-right font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {capturedList.map((c) => (
                    <tr key={c.customerId} className="border-b last:border-0">
                      <td className="py-2 font-medium">{c.name}</td>
                      <td className="py-2 text-right tabular-nums">{c.visits}</td>
                      <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                        {c.linkedTotal > 0 ? formatMoney(c.linkedTotal, currency) : "—"}
                      </td>
                      <td className="text-muted-foreground py-2 text-right tabular-nums">
                        {shortDate(c.lastSeen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
