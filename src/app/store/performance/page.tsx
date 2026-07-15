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
import { shortDate } from "@/lib/format-date";
import { DateRangeForm } from "@/components/shared/date-range-form";
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

  const [
    { data: eventRows },
    { data: checkinRows },
    { data: employees },
    { data: closeRow },
    { data: shiftRows },
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

  // Range section only fetches when the kiosk asked for a range — the default
  // 45s auto-refresh loop must not add Shopify calls.
  const hasRange = Boolean(sp.from || sp.to);
  const { from, to } = resolveDateRange(sp, bd);
  let rangeRows: { name: string; amount: number }[] | null = null;
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
          amount: byStaff.get(normalizeStaffId(e.shopify_staff_id as string)) ?? 0,
        }))
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    }
  }
  const rangeTotal = (rangeRows ?? []).reduce((a, r) => a + r.amount, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardDescription>Sales today</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {daySales ? formatMoney(daySales.total, daySales.currency ?? "USD") : "—"}
            </CardTitle>
          </CardHeader>
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
              <div className="flex flex-col gap-2">
                <p className="text-sm">
                  <span className="text-muted-foreground">
                    {shortDate(from)} – {shortDate(to)} · {spanDays(from, to)}d:
                  </span>{" "}
                  <span className="font-semibold tabular-nums">
                    {formatMoney(rangeTotal, daySales?.currency ?? "USD")}
                  </span>
                </p>
                <ul className="flex flex-col divide-y">
                  {rangeRows.map((r, i) => (
                    <li
                      key={r.name}
                      className="flex items-center justify-between py-1.5 text-sm"
                    >
                      <span>
                        <span className="text-muted-foreground mr-2 tabular-nums">
                          {i + 1}.
                        </span>
                        {r.name}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(r.amount, daySales?.currency ?? "USD")}
                      </span>
                    </li>
                  ))}
                </ul>
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
