import { formatInTimeZone } from "date-fns-tz";
import { requireEmployee } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson } from "@/lib/conversion";
import { orderFloor, type FloorMember } from "@/lib/floor-queue";
import { slotLabelForHours } from "@/lib/shift-slots";
import { FloorBoard, type BoardRow } from "@/components/portal/floor-board";
import { ShiftToday, type ShiftTodayInfo } from "@/components/portal/shift-today";
import {
  ConversionStats,
  type PersonRow,
} from "@/components/portal/conversion-stats";
import { CloseDayButton } from "@/components/portal/close-day-button";

type EventRow = {
  employee_id: string;
  attended_at: string;
  sold: boolean;
  got_contact: boolean;
  employees: { name: string } | null;
};

type CheckinRow = {
  employee_id: string;
  arrived_at: string;
  left_at: string | null;
  status: string;
  rotation_count: number;
  bumped_at: string | null;
  employees: { name: string } | null;
};

export default async function TodayPage() {
  const { employee } = await requireEmployee();
  const service = createServiceClient();
  const isLead =
    employee.role === "shift_lead" || employee.role === "store_manager";

  const { data: loc } = await service
    .from("locations")
    .select("name, timezone")
    .eq("id", employee.location_id)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  const locName = loc?.name ?? "Store";
  const bd = businessDate(tz);

  const [
    { data: dayRow },
    { data: checkinRows },
    { data: roster },
    { data: eventRows },
    { data: closeRow },
    { data: shiftRow },
  ] = await Promise.all([
      service
        .from("floor_days")
        .select("opened_at")
        .eq("location_id", employee.location_id)
        .eq("business_date", bd)
        .maybeSingle(),
      service
        .from("floor_checkins")
        .select(
          "employee_id, arrived_at, left_at, status, rotation_count, bumped_at, employees(name)",
        )
        .eq("location_id", employee.location_id)
        .eq("business_date", bd),
      service
        .from("employees")
        .select("id, name")
        .eq("location_id", employee.location_id)
        .eq("active", true)
        .order("name"),
      service
        .from("client_events")
        .select("employee_id, attended_at, sold, got_contact, employees(name)")
        .eq("location_id", employee.location_id)
        .eq("business_date", bd),
      service
        .from("store_day_closes")
        .select("id")
        .eq("location_id", employee.location_id)
        .eq("business_date", bd)
        .maybeSingle(),
      service
        .from("shifts")
        .select("start_time, end_time, shift_templates(name), schedules!inner(status)")
        .eq("employee_id", employee.id)
        .eq("date", bd)
        .eq("schedules.status", "published")
        .order("start_time")
        .limit(1)
        .maybeSingle(),
    ]);

  const checkins = (checkinRows ?? []) as CheckinRow[];
  const members: FloorMember[] = checkins.map((c) => ({
    employeeId: c.employee_id,
    name: c.employees?.name ?? "—",
    arrivedAt: c.arrived_at,
    leftAt: c.left_at,
    status: c.status === "attending" ? "attending" : "available",
    rotationCount: c.rotation_count,
    bumpedAt: c.bumped_at,
  }));
  const rows: BoardRow[] = orderFloor(members).map((r) => ({
    employeeId: r.employeeId,
    name: r.name,
    state: r.state,
    turn: r.turn,
    arrivedLabel: formatInTimeZone(new Date(r.arrivedAt), tz, "HH:mm"),
  }));

  const onFloor = new Set(
    checkins.filter((c) => !c.left_at).map((c) => c.employee_id),
  );
  const rosterOptions = (roster ?? []).filter((e) => !onFloor.has(e.id));

  // Conversion stats for the day.
  const events = (eventRows ?? []) as EventRow[];
  const store = totals(events);
  const mine = totals(events.filter((e) => e.employee_id === employee.id));
  const nameOf = new Map<string, string>();
  for (const e of events) if (e.employees?.name) nameOf.set(e.employee_id, e.employees.name);
  for (const c of checkins) if (c.employees?.name) nameOf.set(c.employee_id, c.employees.name);
  const people: PersonRow[] = byPerson(events).map((p) => ({
    ...p,
    name: nameOf.get(p.employeeId) ?? "Unknown",
    isMe: p.employeeId === employee.id,
  }));

  const lastEvent = events.reduce<EventRow | null>(
    (last, e) => (!last || e.attended_at > last.attended_at ? e : last),
    null,
  );
  const lastAttendedName = lastEvent
    ? (nameOf.get(lastEvent.employee_id) ?? lastEvent.employees?.name ?? null)
    : null;

  // My shift today + entry state, shown before any floor-queue dynamics.
  const hhmm = (t: string) => t.slice(0, 5);
  const myShift: ShiftTodayInfo | null = shiftRow
    ? {
        label:
          slotLabelForHours(shiftRow.start_time, shiftRow.end_time) ??
          (shiftRow.shift_templates as { name: string } | null)?.name ??
          "Shift",
        start: hhmm(shiftRow.start_time),
        end: hhmm(shiftRow.end_time),
      }
    : null;
  const myCheckin = checkins.find((c) => c.employee_id === employee.id);
  const checkedInAtLabel = myCheckin
    ? formatInTimeZone(new Date(myCheckin.arrived_at), tz, "HH:mm")
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Today · {locName}</h1>
        <p className="text-muted-foreground text-sm tabular-nums">{bd}</p>
      </div>

      <ShiftToday
        meId={employee.id}
        shift={myShift}
        checkedInAtLabel={checkedInAtLabel}
        leftFloor={Boolean(myCheckin?.left_at)}
      />

      <FloorBoard
        meId={employee.id}
        isLead={isLead}
        open={Boolean(dayRow)}
        rows={rows}
        roster={rosterOptions}
        lastAttendedName={lastAttendedName}
      />

      <ConversionStats store={store} mine={mine} people={people} />

      <CloseDayButton alreadyClosed={Boolean(closeRow)} />
    </div>
  );
}
