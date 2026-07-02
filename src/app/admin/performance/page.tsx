import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { accessibleLocationIds } from "@/lib/auth";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson, formatPct } from "@/lib/conversion";
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

  const [{ data: eventRows }, { data: closeRow }] = await Promise.all([
    supabase
      .from("client_events")
      .select("employee_id, sold, got_contact, employees(name)")
      .eq("location_id", location.id)
      .eq("business_date", date),
    supabase
      .from("store_day_closes")
      .select("id")
      .eq("location_id", location.id)
      .eq("business_date", date)
      .maybeSingle(),
  ]);

  const events = (eventRows ?? []) as EventRow[];
  const store = totals(events);
  const nameOf = new Map<string, string>();
  for (const e of events) if (e.employees?.name) nameOf.set(e.employee_id, e.employees.name);
  const people = byPerson(events);

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
          <span className="min-w-28 text-center text-sm font-semibold tabular-nums">
            {date}
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

      <div className="grid gap-4 sm:grid-cols-3">
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By employee</CardTitle>
          <CardDescription>
            {location.name} · {date}
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
    </div>
  );
}
