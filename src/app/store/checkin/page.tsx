import { formatInTimeZone } from "date-fns-tz";
import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { workedHours } from "@/lib/attendance";
import { breakMinutes, openBreak, type BreakRow } from "@/lib/breaks";
import {
  CheckinBoard,
  type CheckinRow,
  type RosterEntry,
} from "@/components/store/checkin-board";

export default async function StoreCheckinPage() {
  const { locationId } = await requireStore();
  const service = createServiceClient();

  const { data: loc } = await service
    .from("locations")
    .select("timezone")
    .eq("id", locationId)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  const bd = businessDate(tz);

  const [{ data: checkinRows }, { data: employees }, { data: breakRows }] =
    await Promise.all([
      service
        .from("floor_checkins")
        .select(
          "employee_id, arrived_at, left_at, status, attending_count, attending_return_count, entry_photo_path, exit_photo_path",
        )
        .eq("location_id", locationId)
        .eq("business_date", bd)
        .order("arrived_at"),
      service
        .from("employees")
        .select("id, name, avatar_color")
        .eq("location_id", locationId)
        .eq("active", true)
        .order("name"),
      service
        .from("floor_breaks")
        .select("employee_id, started_at, ended_at")
        .eq("location_id", locationId)
        .eq("business_date", bd),
    ]);

  const roster = employees ?? [];
  const nameOf = new Map(roster.map((e) => [e.id, e.name]));
  const colorOf = new Map(roster.map((e) => [e.id, e.avatar_color]));

  // Private bucket — thumbnails only via short-lived signed URLs (today's rows only).
  const paths = (checkinRows ?? [])
    .flatMap((c) => [c.entry_photo_path, c.exit_photo_path])
    .filter((p): p is string => Boolean(p));
  const signedOf = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await service.storage
      .from("checkin-photos")
      .createSignedUrls(paths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) signedOf.set(s.path, s.signedUrl);
    }
  }

  const breaksOf = new Map<string, BreakRow[]>();
  for (const b of breakRows ?? []) {
    const arr = breaksOf.get(b.employee_id) ?? [];
    arr.push({ startedAt: b.started_at, endedAt: b.ended_at });
    breaksOf.set(b.employee_id, arr);
  }
  const nowIso = new Date().toISOString();

  const checkins: CheckinRow[] = (checkinRows ?? []).map((c) => {
    const memberBreaks = breaksOf.get(c.employee_id) ?? [];
    const open = openBreak(memberBreaks);
    return {
      employeeId: c.employee_id,
      name: nameOf.get(c.employee_id) ?? "—",
      avatarColor: colorOf.get(c.employee_id) ?? null,
      arrivedLabel: formatInTimeZone(new Date(c.arrived_at), tz, "HH:mm"),
      leftLabel: c.left_at ? formatInTimeZone(new Date(c.left_at), tz, "HH:mm") : null,
      hours: workedHours(c.arrived_at, c.left_at),
      breakMinutes: breakMinutes(memberBreaks, nowIso),
      onBreak: !c.left_at && open !== null,
      breakStartedAt: open?.startedAt ?? null,
      // closed breaks only — the open one is clocked live by the timer
      breakPriorMinutes: breakMinutes(
        memberBreaks.filter((b) => b.endedAt !== null),
        nowIso,
      ),
      attending:
        c.attending_count + c.attending_return_count > 0 || c.status === "attending",
      entryPhotoUrl: c.entry_photo_path ? (signedOf.get(c.entry_photo_path) ?? null) : null,
      exitPhotoUrl: c.exit_photo_path ? (signedOf.get(c.exit_photo_path) ?? null) : null,
    };
  });

  // Anyone not currently on the floor can check in (a re-check-in after
  // leaving upserts the same row and keeps their queue position).
  const onFloor = new Set(
    (checkinRows ?? []).filter((c) => !c.left_at).map((c) => c.employee_id),
  );
  const offFloor: RosterEntry[] = roster
    .filter((e) => !onFloor.has(e.id))
    .map((e) => ({ id: e.id, name: e.name, avatarColor: e.avatar_color }));

  return <CheckinBoard checkins={checkins} offFloor={offFloor} />;
}
