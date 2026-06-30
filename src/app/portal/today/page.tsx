import { requireEmployee } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson } from "@/lib/conversion";
import { ClientSwipe } from "@/components/portal/client-swipe";
import {
  ConversionStats,
  type PersonRow,
} from "@/components/portal/conversion-stats";
import { CloseDayButton } from "@/components/portal/close-day-button";

const hhmm = (t: string) => t.slice(0, 5);

type EventRow = {
  employee_id: string;
  sold: boolean;
  got_contact: boolean;
  employees: { name: string } | null;
};

export default async function TodayPage() {
  const { employee } = await requireEmployee();
  const service = createServiceClient();

  const { data: loc } = await service
    .from("locations")
    .select("name, timezone")
    .eq("id", employee.location_id)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  const locName = loc?.name ?? "Store";
  const bd = businessDate(tz);

  // Who's working today (published shifts at this location), deduped per person.
  const { data: rosterRows } = await service
    .from("shifts")
    .select(
      "employee_id, start_time, end_time, employees!inner(name), schedules!inner(status, location_id)",
    )
    .eq("date", bd)
    .eq("schedules.status", "published")
    .eq("schedules.location_id", employee.location_id)
    .order("start_time");
  const roster = new Map<string, { name: string; start: string; end: string }>();
  for (const r of rosterRows ?? []) {
    const name = (r.employees as { name: string } | null)?.name ?? "—";
    if (!roster.has(r.employee_id)) {
      roster.set(r.employee_id, { name, start: r.start_time, end: r.end_time });
    }
  }

  // Today's conversion events for the whole location.
  const { data: eventRows } = await service
    .from("client_events")
    .select("employee_id, sold, got_contact, employees(name)")
    .eq("location_id", employee.location_id)
    .eq("business_date", bd);
  const events = (eventRows ?? []) as EventRow[];

  const store = totals(events);
  const mine = totals(events.filter((e) => e.employee_id === employee.id));
  const nameOf = new Map<string, string>();
  for (const e of events) if (e.employees?.name) nameOf.set(e.employee_id, e.employees.name);
  for (const [id, r] of roster) if (!nameOf.has(id)) nameOf.set(id, r.name);
  const people: PersonRow[] = byPerson(events).map((p) => ({
    ...p,
    name: nameOf.get(p.employeeId) ?? "Unknown",
    isMe: p.employeeId === employee.id,
  }));

  const { data: closeRow } = await service
    .from("store_day_closes")
    .select("id")
    .eq("location_id", employee.location_id)
    .eq("business_date", bd)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Today · {locName}</h1>
        <p className="text-muted-foreground text-sm tabular-nums">{bd}</p>
      </div>

      {roster.size > 0 && (
        <div className="flex flex-wrap gap-2">
          {[...roster.values()].map((r) => (
            <span
              key={r.name + r.start}
              className="bg-muted rounded-full px-3 py-1 text-xs"
            >
              {r.name} · {hhmm(r.start)}–{hhmm(r.end)}
            </span>
          ))}
        </div>
      )}

      <ClientSwipe />

      <ConversionStats store={store} mine={mine} people={people} />

      <CloseDayButton alreadyClosed={Boolean(closeRow)} />
    </div>
  );
}
