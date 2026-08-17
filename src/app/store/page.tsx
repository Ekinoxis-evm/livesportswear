import { formatInTimeZone } from "date-fns-tz";
import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { orderFloor, type FloorMember } from "@/lib/floor-queue";
import { openBreak, breakMinutes, type BreakRow } from "@/lib/breaks";
import { asQueue } from "@/lib/attend-timer";
import { SalesBoard, type SalesRow } from "@/components/store/sales-board";

type CheckinRow = {
  employee_id: string;
  arrived_at: string;
  available_since: string | null;
  left_at: string | null;
  status: string;
  rotation_count: number;
  bumped_at: string | null;
  manual_pos: number | null;
  attending_count: number;
  attending_return_count: number;
  attending_started_at: unknown;
};

export default async function StoreSalesPage() {
  const { locationId } = await requireStore();
  const service = createServiceClient();

  const { data: loc } = await service
    .from("locations")
    .select("timezone")
    .eq("id", locationId)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  const bd = businessDate(tz);

  const [{ data: dayRow }, { data: checkinRows }, { data: employees }, { data: breakRows }] =
    await Promise.all([
      service
        .from("floor_days")
        .select("opened_at")
        .eq("location_id", locationId)
        .eq("business_date", bd)
        .maybeSingle(),
      service
        .from("floor_checkins")
        .select(
          "employee_id, arrived_at, available_since, left_at, status, rotation_count, bumped_at, manual_pos, attending_count, attending_return_count, attending_started_at",
        )
        .eq("location_id", locationId)
        .eq("business_date", bd),
      service
        .from("employees")
        .select("id, name, avatar_color, avatar_url")
        .eq("location_id", locationId)
        .eq("active", true)
        .order("name"),
      service
        .from("floor_breaks")
        .select("employee_id, started_at, ended_at")
        .eq("location_id", locationId)
        .eq("business_date", bd)
        .order("started_at"),
    ]);

  const roster = employees ?? [];
  const nameOf = new Map(roster.map((e) => [e.id, e.name]));
  const colorOf = new Map(roster.map((e) => [e.id, e.avatar_color]));
  const photoOf = new Map(roster.map((e) => [e.id, e.avatar_url]));

  const breaksOf = new Map<string, BreakRow[]>();
  for (const b of breakRows ?? []) {
    const arr = breaksOf.get(b.employee_id) ?? [];
    arr.push({ startedAt: b.started_at, endedAt: b.ended_at });
    breaksOf.set(b.employee_id, arr);
  }
  const nowIso = new Date().toISOString();

  const checkins = (checkinRows ?? []) as CheckinRow[];
  // The whole queue reaches the board, not just its earliest stamp: a rep
  // holding two clients needs a timer each, and the finish has to name one.
  const openClientsOf = new Map(
    checkins.map((c) => [c.employee_id, asQueue(c.attending_started_at)]),
  );
  const members: FloorMember[] = checkins.map((c) => ({
    employeeId: c.employee_id,
    name: nameOf.get(c.employee_id) ?? "—",
    arrivedAt: c.arrived_at,
    availableSince: c.available_since ?? c.arrived_at,
    leftAt: c.left_at,
    status: c.status === "attending" ? "attending" : "available",
    rotationCount: c.rotation_count,
    bumpedAt: c.bumped_at,
    manualPos: c.manual_pos,
    attendingCount: c.attending_count,
    returnCount: c.attending_return_count,
    onBreak: openBreak(breaksOf.get(c.employee_id) ?? []) !== null,
  }));
  const rows: SalesRow[] = orderFloor(members).map((r) => {
    const memberBreaks = breaksOf.get(r.employeeId) ?? [];
    const open = openBreak(memberBreaks);
    return {
      employeeId: r.employeeId,
      name: r.name,
      avatarColor: colorOf.get(r.employeeId) ?? null,
      avatarUrl: photoOf.get(r.employeeId) ?? null,
      state: r.state,
      turn: r.turn,
      turns: r.rotationCount,
      arrivedLabel: formatInTimeZone(new Date(r.arrivedAt), tz, "HH:mm"),
      sinceLabel: formatInTimeZone(new Date(r.availableSince), tz, "HH:mm"),
      walkins: r.attendingCount ?? 0,
      returns: r.returnCount ?? 0,
      onReturn: r.onReturn,
      openClients: openClientsOf.get(r.employeeId) ?? [],
      breakStartedAt: open?.startedAt ?? null,
      // closed breaks only — the open one is clocked live by the timer
      breakPriorMinutes: breakMinutes(
        memberBreaks.filter((b) => b.endedAt !== null),
        nowIso,
      ),
    };
  });

  return <SalesBoard open={Boolean(dayRow)} rows={rows} />;
}
