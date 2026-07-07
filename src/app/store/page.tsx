import { formatInTimeZone } from "date-fns-tz";
import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { totals, formatPct } from "@/lib/conversion";
import { orderFloor, type FloorMember } from "@/lib/floor-queue";
import {
  KioskBoard,
  type KioskRow,
  type RosterEntry,
} from "@/components/store/kiosk-board";

type CheckinRow = {
  employee_id: string;
  arrived_at: string;
  left_at: string | null;
  status: string;
  rotation_count: number;
  bumped_at: string | null;
};

export default async function StorePage() {
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
    { data: dayRow },
    { data: checkinRows },
    { data: employees },
    { data: eventRows },
    { data: closeRow },
    { data: shiftRows },
  ] = await Promise.all([
    service
      .from("floor_days")
      .select("opened_at")
      .eq("location_id", locationId)
      .eq("business_date", bd)
      .maybeSingle(),
    service
      .from("floor_checkins")
      .select("employee_id, arrived_at, left_at, status, rotation_count, bumped_at")
      .eq("location_id", locationId)
      .eq("business_date", bd),
    service
      .from("employees")
      .select("id, name, avatar_color")
      .eq("location_id", locationId)
      .eq("active", true)
      .order("name"),
    service
      .from("client_events")
      .select("employee_id, sold, got_contact")
      .eq("location_id", locationId)
      .eq("business_date", bd),
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
  const colorOf = new Map(roster.map((e) => [e.id, e.avatar_color]));

  const checkins = (checkinRows ?? []) as CheckinRow[];
  const members: FloorMember[] = checkins.map((c) => ({
    employeeId: c.employee_id,
    name: nameOf.get(c.employee_id) ?? "—",
    arrivedAt: c.arrived_at,
    leftAt: c.left_at,
    status: c.status === "attending" ? "attending" : "available",
    rotationCount: c.rotation_count,
    bumpedAt: c.bumped_at,
  }));
  const rows: KioskRow[] = orderFloor(members).map((r) => ({
    employeeId: r.employeeId,
    name: r.name,
    avatarColor: colorOf.get(r.employeeId) ?? null,
    state: r.state,
    turn: r.turn,
    arrivedLabel: formatInTimeZone(new Date(r.arrivedAt), tz, "HH:mm"),
  }));

  const onFloor = new Set(
    checkins.filter((c) => !c.left_at).map((c) => c.employee_id),
  );
  const offFloor: RosterEntry[] = roster
    .filter((e) => !onFloor.has(e.id))
    .map((e) => ({ id: e.id, name: e.name, avatarColor: e.avatar_color }));

  // Eligible closers: on today's published schedule AND currently checked in.
  const onShift = new Set((shiftRows ?? []).map((s) => s.employee_id));
  const closers: RosterEntry[] = roster
    .filter((e) => onShift.has(e.id) && onFloor.has(e.id))
    .map((e) => ({ id: e.id, name: e.name, avatarColor: e.avatar_color }));

  const t = totals(eventRows ?? []);

  return (
    <KioskBoard
      open={Boolean(dayRow)}
      rows={rows}
      offFloor={offFloor}
      closers={closers}
      totals={{
        attended: t.attended,
        sold: t.sold,
        conversionPct: t.attended > 0 ? formatPct(t.conversion) : "—",
      }}
      alreadyClosed={Boolean(closeRow)}
    />
  );
}
