import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { accessibleLocationIds } from "@/lib/auth";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson, formatPct } from "@/lib/conversion";
import { stampStatus, workedHours, type AttendanceStamp } from "@/lib/attendance";
import { breakMinutes, overBreakBudget, type BreakRow } from "@/lib/breaks";
import { weekdayName } from "@/lib/weekdays";
import { shortDate } from "@/lib/format-date";
import { formatMoney } from "@/lib/commission";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { fetchDaySales } from "@/lib/shopify";
import { dayRangeInTz } from "@/lib/shopify-range";
import { cn } from "@/lib/utils";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EventRow = {
  employee_id: string;
  sold: boolean;
  got_contact: boolean;
  employees: { name: string } | null;
};

type HoursRow = {
  employee_id: string;
  arrived_at: string;
  left_at: string | null;
  entry_validated_at: string | null;
  entry_validated_by: string | null;
  entry_self: boolean;
  exit_validated_at: string | null;
  exit_validated_by: string | null;
  exit_self: boolean;
  exit_missed: boolean;
  employees: { name: string } | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerClient();

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, timezone")
    .eq("active", true)
    .order("name");
  const access = await accessibleLocationIds();
  const locations = (locationRows ?? []).filter(
    (l) => access === "all" || access.includes(l.id),
  );
  if (locations.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
        <p className="text-muted-foreground text-sm">No active stores.</p>
      </div>
    );
  }

  const location =
    locations.find((l) => l.id === sp.location) ?? locations[0];
  const today = businessDate(location.timezone);
  const date = sp.date && DATE_RE.test(sp.date) ? sp.date : today;

  const href = (d: string, loc = location.id) =>
    `/admin/performance?location=${loc}&date=${d}`;

  const [{ data: eventRows }, { data: closeRow }, { data: checkinRows }, { data: staffRows }, { data: breakRows }] =
    await Promise.all([
      supabase
        .from("client_events")
        .select("employee_id, sold, got_contact, employees(name)")
        .eq("location_id", location.id)
        .eq("business_date", date),
      supabase
        .from("store_day_closes")
        .select("id, shopify_sales, currency")
        .eq("location_id", location.id)
        .eq("business_date", date)
        .maybeSingle(),
      supabase
        .from("floor_checkins")
        .select(
          "employee_id, arrived_at, left_at, entry_validated_at, entry_validated_by, entry_self, exit_validated_at, exit_validated_by, exit_self, exit_missed, employees!employee_id(name)",
        )
        .eq("location_id", location.id)
        .eq("business_date", date)
        .order("arrived_at"),
      supabase.from("employees").select("id, name").eq("location_id", location.id),
      supabase
        .from("floor_breaks")
        .select("employee_id, started_at, ended_at")
        .eq("location_id", location.id)
        .eq("business_date", date),
    ]);

  const events = (eventRows ?? []) as EventRow[];
  const store = totals(events);
  const nameOf = new Map<string, string>();
  for (const e of events) if (e.employees?.name) nameOf.set(e.employee_id, e.employees.name);
  const people = byPerson(events);

  const checkins = (checkinRows ?? []) as HoursRow[];
  const staffName = new Map((staffRows ?? []).map((s) => [s.id, s.name]));
  const tz = location.timezone;
  const hhmm = (iso: string) => formatInTimeZone(new Date(iso), tz, "HH:mm");
  const stampBadge = (stamp: AttendanceStamp, validatedBy: string | null, kind: "entry" | "exit") => {
    const status = stampStatus(stamp);
    if (status === "none") return null;
    if (status === "validated") {
      return (
        <span className="text-emerald-600">
          ✓ {staffName.get(validatedBy ?? "") ?? "validated"}
        </span>
      );
    }
    if (status === "self") {
      return (
        <span className="text-amber-600">
          ⚑ {kind === "entry" ? "first in" : "last out"}
        </span>
      );
    }
    if (status === "missed") {
      return <span className="text-destructive">✗ missed check-out</span>;
    }
    return <span className="text-muted-foreground">⏳ pending</span>;
  };
  const totalHours = checkins.reduce(
    (sum, c) => sum + (workedHours(c.arrived_at, c.left_at) ?? 0),
    0,
  );

  // Past days have no open breaks (the nightly sweep closes them), so the
  // render-time now only matters when viewing today.
  const breaksOf = new Map<string, BreakRow[]>();
  for (const b of breakRows ?? []) {
    const arr = breaksOf.get(b.employee_id) ?? [];
    arr.push({ startedAt: b.started_at, endedAt: b.ended_at });
    breaksOf.set(b.employee_id, arr);
  }
  const nowIso = new Date().toISOString();
  const breakOf = (employeeId: string) =>
    breakMinutes(breaksOf.get(employeeId) ?? [], nowIso);

  // Day's Shopify money: the close-time snapshot when the day was closed,
  // otherwise a live read (today, or a day closed before Shopify connected).
  let shopifySales: number | null =
    closeRow?.shopify_sales != null ? Number(closeRow.shopify_sales) : null;
  const currency = closeRow?.currency ?? "USD";
  if (shopifySales == null && isShopifyConfigured()) {
    try {
      const range = dayRangeInTz(date, tz);
      shopifySales = (await fetchDaySales(range.start, range.endExclusive)).total;
    } catch {
      // card shows an em dash
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Performance</h1>
        <div className="flex flex-wrap gap-1.5">
          {locations.map((l) => (
            <Link
              key={l.id}
              href={href(date, l.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                l.id === location.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={href(shiftDate(date, -1))}
            aria-label="Previous day"
            className="hover:bg-muted rounded-md border p-1.5"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-36 text-center text-sm font-semibold">
            {weekdayName(date)} · {shortDate(date)}
          </span>
          <Link
            href={href(shiftDate(date, 1))}
            aria-label="Next day"
            className="hover:bg-muted rounded-md border p-1.5"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
        {date !== today && (
          <Link href={href(today)} className="text-primary text-sm underline-offset-4 hover:underline">
            Today
          </Link>
        )}
        {closeRow ? (
          <Badge variant="default">Day closed</Badge>
        ) : (
          <Badge variant="secondary">Not closed</Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Clients attended</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{store.attended}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Clients sold</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{store.sold}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Conversion</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {store.attended > 0 ? formatPct(store.conversion) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Shopify sales</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {shopifySales != null ? formatMoney(shopifySales, currency) : "—"}
            </CardTitle>
            {closeRow?.shopify_sales == null && shopifySales != null && (
              <CardDescription>live — snapshots at close</CardDescription>
            )}
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By employee</CardTitle>
          <CardDescription>
            {location.name} · {shortDate(date)}
          </CardDescription>
        </CardHeader>
        {people.length === 0 ? (
          <p className="text-muted-foreground px-6 pb-6 text-sm">
            No clients logged this day.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Attended</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead className="text-right">Conversion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => (
                <TableRow key={p.employeeId}>
                  <TableCell className="font-medium">
                    {nameOf.get(p.employeeId) ?? "Unknown"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.attended}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.sold}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.contacts}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPct(p.conversion)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hours worked</CardTitle>
          <CardDescription>
            Entry / exit as validated on the floor · {location.name} · {shortDate(date)}
          </CardDescription>
        </CardHeader>
        {checkins.length === 0 ? (
          <p className="text-muted-foreground px-6 pb-6 text-sm">
            Nobody checked in this day.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead className="text-right">Break</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkins.map((c) => {
                  const hours = workedHours(c.arrived_at, c.left_at);
                  return (
                    <TableRow key={c.employee_id}>
                      <TableCell className="font-medium">
                        {c.employees?.name ?? staffName.get(c.employee_id) ?? "Unknown"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {hhmm(c.arrived_at)}{" "}
                        <span className="text-xs">
                          {stampBadge(
                            {
                              at: c.arrived_at,
                              validatedAt: c.entry_validated_at,
                              self: c.entry_self,
                            },
                            c.entry_validated_by,
                            "entry",
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {c.left_at ? (
                          <>
                            {hhmm(c.left_at)}{" "}
                            <span className="text-xs">
                              {stampBadge(
                                {
                                  at: c.left_at,
                                  validatedAt: c.exit_validated_at,
                                  self: c.exit_self,
                                  missed: c.exit_missed,
                                },
                                c.exit_validated_by,
                                "exit",
                              )}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">on floor</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(() => {
                          const bm = breakOf(c.employee_id);
                          if (bm === 0) return "—";
                          return (
                            <span
                              className={
                                overBreakBudget(bm)
                                  ? "text-destructive font-semibold"
                                  : undefined
                              }
                            >
                              {bm}m{overBreakBudget(bm) && " ⚑"}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hours != null ? hours.toFixed(1) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="text-muted-foreground px-6 pb-4 text-right text-sm tabular-nums">
              Day total: <span className="font-semibold">{totalHours.toFixed(1)}h</span>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
