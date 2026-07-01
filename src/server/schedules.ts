"use server";

import * as React from "react";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth";
import { isMonday, addDays, isoWeekday, formatWeekRange } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { slotLabelForHours } from "@/lib/shift-slots";
import { validateSchedule, hasBlockers } from "@/lib/scheduling/rules";
import { buildEmployeeFeed } from "@/lib/ical";
import { sendSafe } from "@/lib/resend";
import { SchedulePublishedEmail } from "@/lib/emails/schedule-published";
import { type ActionResult, dbError } from "@/server/shared";

const uuid = z.string().uuid();

type ScheduleRef = { id: string; status: "draft" | "published" };

/** Get the (location, week) draft schedule, creating it if absent. */
export async function ensureSchedule(
  locationId: string,
  weekStart: string,
): Promise<ActionResult<ScheduleRef>> {
  await requireAdmin();
  if (!uuid.safeParse(locationId).success) {
    return { ok: false, error: "Invalid location." };
  }
  if (!isMonday(weekStart)) {
    return { ok: false, error: "Week must start on a Monday." };
  }

  const supabase = await createServerClient();

  const existing = await supabase
    .from("schedules")
    .select("id, status")
    .eq("location_id", locationId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, error: dbError(existing.error) };
  }
  if (existing.data) {
    revalidatePath("/admin/schedules");
    return { ok: true, data: existing.data };
  }

  const { data, error } = await supabase
    .from("schedules")
    .insert({ location_id: locationId, week_start: weekStart, status: "draft" })
    .select("id, status")
    .single();

  if (error) {
    // Lost a race to another writer — fetch the row that now exists.
    if (error.code === "23505") {
      const retry = await supabase
        .from("schedules")
        .select("id, status")
        .eq("location_id", locationId)
        .eq("week_start", weekStart)
        .single();
      if (retry.data) return { ok: true, data: retry.data };
    }
    return { ok: false, error: dbError(error) };
  }

  revalidatePath("/admin/schedules");
  return { ok: true, data };
}

/**
 * Copy every shift from the previous week into this one (dates shifted +7).
 * Refuses if the target week already has shifts, to avoid duplicates.
 */
export async function copyFromLastWeek(
  locationId: string,
  weekStart: string,
): Promise<ActionResult<{ copied: number }>> {
  await requireAdmin();
  if (!uuid.safeParse(locationId).success) {
    return { ok: false, error: "Invalid location." };
  }
  if (!isMonday(weekStart)) {
    return { ok: false, error: "Week must start on a Monday." };
  }

  const ensured = await ensureSchedule(locationId, weekStart);
  if (!ensured.ok) return ensured;
  const targetId = ensured.data!.id;

  const supabase = await createServerClient();

  const target = await supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .eq("schedule_id", targetId);
  if (target.error) {
    return { ok: false, error: dbError(target.error) };
  }
  if ((target.count ?? 0) > 0) {
    return { ok: false, error: "This week already has shifts." };
  }

  const prevWeek = addDays(weekStart, -7);
  const prev = await supabase
    .from("schedules")
    .select("id")
    .eq("location_id", locationId)
    .eq("week_start", prevWeek)
    .maybeSingle();
  if (prev.error) {
    return { ok: false, error: dbError(prev.error) };
  }
  if (!prev.data) {
    return { ok: false, error: "There's no schedule for last week to copy." };
  }

  const prevShifts = await supabase
    .from("shifts")
    .select("employee_id, date, shift_template_id, start_time, end_time, notes")
    .eq("schedule_id", prev.data.id);
  if (prevShifts.error) return { ok: false, error: dbError(prevShifts.error) };
  if (!prevShifts.data.length) {
    return { ok: false, error: "Last week's schedule is empty." };
  }

  const rows = prevShifts.data.map((s) => ({
    schedule_id: targetId,
    employee_id: s.employee_id,
    date: addDays(s.date, 7),
    shift_template_id: s.shift_template_id,
    start_time: s.start_time,
    end_time: s.end_time,
    notes: s.notes,
  }));

  const { error } = await supabase.from("shifts").insert(rows);
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/schedules");
  return { ok: true, data: { copied: rows.length } };
}

const hhmm = (t: string) => t.slice(0, 5);

/**
 * Canonical publish: load -> validate -> block-gate -> mark published + audit
 * -> email each affected employee (dry-run aware) with their ICS. See
 * .claude/skills/scheduling-skill.
 */
export async function publishSchedule(
  scheduleId: string,
): Promise<ActionResult<{ sent: number; total: number }>> {
  const admin = await requireAdmin();
  if (!uuid.safeParse(scheduleId).success) {
    return { ok: false, error: "Invalid schedule id." };
  }

  const supabase = await createServerClient();

  const sched = await supabase
    .from("schedules")
    .select("id, location_id, week_start, status")
    .eq("id", scheduleId)
    .single();
  if (sched.error || !sched.data) {
    return { ok: false, error: "Schedule not found." };
  }

  const loc = await supabase
    .from("locations")
    .select("name, address, timezone")
    .eq("id", sched.data.location_id)
    .single();
  if (loc.error || !loc.data) {
    return { ok: false, error: "Location not found." };
  }

  const employeesRes = await supabase
    .from("employees")
    .select(
      "id, name, email, magic_token, weekly_hour_target, max_days_per_week, weekly_days_off, preferred_days_off",
    )
    .eq("location_id", sched.data.location_id)
    .eq("active", true);
  const employees = employeesRes.data ?? [];

  const templatesRes = await supabase
    .from("shift_templates")
    .select("id, name, default_headcount")
    .eq("location_id", sched.data.location_id)
    .eq("active", true);
  const templates = templatesRes.data ?? [];

  const shiftsRes = await supabase
    .from("shifts")
    .select("id, employee_id, date, shift_template_id, start_time, end_time")
    .eq("schedule_id", scheduleId);
  const shifts = shiftsRes.data ?? [];

  const empIds = employees.map((e) => e.id);
  const timeOffRes = empIds.length
    ? await supabase
        .from("time_off_requests")
        .select("employee_id, start_date, end_date, status")
        .in("employee_id", empIds)
        .eq("status", "approved")
    : { data: [] };

  const violations = validateSchedule({
    schedule: { week_start: sched.data.week_start },
    shifts,
    employees,
    timeOff: timeOffRes.data ?? [],
    templates,
  });
  if (hasBlockers(violations)) {
    const n = violations.filter((v) => v.level === "block").length;
    return {
      ok: false,
      error: `Resolve ${n} blocker${n === 1 ? "" : "s"} before publishing.`,
    };
  }

  const upd = await supabase
    .from("schedules")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      published_by: admin.id,
    })
    .eq("id", scheduleId);
  if (upd.error) return { ok: false, error: dbError(upd.error) };

  // audit_log has no authenticated insert policy — use the service client.
  const service = createServiceClient();
  await service.from("audit_log").insert({
    actor: admin.id,
    action: "schedule.published",
    entity: "schedule",
    entity_id: scheduleId,
    diff: {
      week_start: sched.data.week_start,
      location_id: sched.data.location_id,
      shifts: shifts.length,
    },
  });

  const templateName = new Map(templates.map((t) => [t.id, t.name]));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const weekRange = formatWeekRange(sched.data.week_start);

  let sent = 0;
  let total = 0;
  for (const emp of employees) {
    const empShifts = shifts
      .filter((s) => s.employee_id === emp.id)
      .sort((a, b) =>
        a.date === b.date
          ? a.start_time.localeCompare(b.start_time)
          : a.date.localeCompare(b.date),
      );
    if (empShifts.length === 0) continue;
    total++;

    const ics = buildEmployeeFeed({
      employeeName: emp.name,
      location: loc.data,
      shifts: empShifts.map((s) => ({
        id: s.id,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        templateName: s.shift_template_id
          ? (templateName.get(s.shift_template_id) ?? null)
          : slotLabelForHours(s.start_time, s.end_time),
      })),
    });

    const res = await sendSafe({
      to: emp.email,
      subject: `Your schedule for ${weekRange} is published`,
      react: React.createElement(SchedulePublishedEmail, {
        employeeName: emp.name,
        locationName: loc.data.name,
        weekRange,
        scheduleUrl: `${appUrl}/s/${emp.magic_token}`,
        shifts: empShifts.map((s) => ({
          date: `${SHORT_WEEKDAYS[isoWeekday(s.date) - 1]} ${s.date.slice(8, 10)}`,
          label: s.shift_template_id
            ? (templateName.get(s.shift_template_id) ?? "Shift")
            : (slotLabelForHours(s.start_time, s.end_time) ?? "Custom"),
          time: `${hhmm(s.start_time)}–${hhmm(s.end_time)}`,
        })),
      }),
      attachments: [{ filename: "schedule.ics", content: ics }],
    });
    if (res.ok) sent++;
  }

  revalidatePath("/admin/schedules");
  return { ok: true, data: { sent, total } };
}
