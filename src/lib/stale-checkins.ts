import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { missedExitInstant } from "@/lib/attendance";

export type StaleCheckinsResult =
  | { ok: true; closed: number }
  | { ok: false; error: string };

/**
 * Auto-close check-ins that survived past their business day (someone forgot
 * to tap "check out"). The exit is stamped at their published shift end that
 * day — local midnight when they had no shift — and flagged `exit_missed`
 * so payroll reviews it instead of trusting it. Runs from the daily cron.
 */
export async function closeStaleCheckins(): Promise<StaleCheckinsResult> {
  const service = createServiceClient();

  const { data: locations, error: locErr } = await service
    .from("locations")
    .select("id, timezone")
    .eq("active", true);
  if (locErr) return { ok: false, error: locErr.message };

  let closed = 0;
  for (const loc of locations ?? []) {
    const today = businessDate(loc.timezone);
    const { data: rows, error } = await service
      .from("floor_checkins")
      .select("id, employee_id, business_date, arrived_at")
      .eq("location_id", loc.id)
      .is("left_at", null)
      .lt("business_date", today);
    if (error) return { ok: false, error: error.message };
    if (!rows || rows.length === 0) continue;

    for (const row of rows) {
      const { data: shift } = await service
        .from("shifts")
        .select("end_time, schedules!inner(status)")
        .eq("employee_id", row.employee_id)
        .eq("date", row.business_date)
        .eq("schedules.status", "published")
        .order("end_time", { ascending: false })
        .limit(1)
        .maybeSingle();

      const leftAt = missedExitInstant(
        row.business_date,
        loc.timezone,
        shift?.end_time ?? null,
        row.arrived_at,
      );
      const { error: upErr } = await service
        .from("floor_checkins")
        .update({
          left_at: leftAt,
          status: "available",
          attending_count: 0,
          attending_return_count: 0,
          bumped_at: null,
          manual_pos: null,
          exit_missed: true,
          exit_validated_at: null,
          exit_validated_by: null,
          exit_self: false,
        })
        .eq("id", row.id);
      if (upErr) return { ok: false, error: upErr.message };
      closed += 1;
    }
  }

  return { ok: true, closed };
}
