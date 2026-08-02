"use server";

import * as React from "react";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth";
import { isMonday, addDays, isoWeekday, formatWeekRange, weekDays } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import {
  SHIFT_SLOTS,
  templateForSlot,
  shiftMatchesSlot,
  slotLabelForHours,
} from "@/lib/shift-slots";
import { fillSchedule, type MixerSlot, type MixerPlacement } from "@/lib/scheduling/generate";
import { validateSchedule, hasBlockers } from "@/lib/scheduling/rules";
import { buildEmployeeFeed } from "@/lib/ical";
import { sendSafe } from "@/lib/resend";
import { SchedulePublishedEmail } from "@/lib/emails/schedule-published";
import { overlappingCoworkerNames } from "@/lib/coworkers";
import { type ActionResult, dbError, firstError } from "@/server/shared";

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

// ---------------------------------------------------------------------------
// The MIXER: auto-fill a week from the pure generator. Per-run caps/headcounts
// override the saved settings (not persisted). `scratch` clears the week first;
// `complete` fills gaps around what's there. Deterministic by seed, so the
// applied week matches the wizard's preview.
// ---------------------------------------------------------------------------
const mixerSchema = z.object({
  locationId: uuid,
  weekStart: z.string(),
  employeeIds: z.array(uuid).min(1),
  caps: z.record(
    z.string(),
    z.object({
      maxDays: z.coerce.number().int().min(0).max(7),
      daysOff: z.coerce.number().int().min(0).max(7),
    }),
  ),
  headcounts: z.record(z.string(), z.coerce.number().int().min(0).max(50)),
  mode: z.enum(["scratch", "complete"]),
  seed: z.coerce.number().int(),
});

export async function applyMixer(
  input: unknown,
): Promise<ActionResult<{ added: number; gaps: number }>> {
  await requireAdmin();
  const parsed = mixerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { locationId, weekStart, employeeIds, caps, headcounts, mode, seed } = parsed.data;
  if (!isMonday(weekStart)) return { ok: false, error: "Week must start on a Monday." };

  const ensured = await ensureSchedule(locationId, weekStart);
  if (!ensured.ok) return ensured;
  const scheduleId = ensured.data!.id;
  if (ensured.data!.status === "published") {
    return { ok: false, error: "This week is already published — unpublish to change it." };
  }

  const supabase = await createServerClient();
  const days = weekDays(weekStart);

  const { data: empRows } = await supabase
    .from("employees")
    .select("id, max_days_per_week, weekly_days_off")
    .eq("location_id", locationId)
    .eq("active", true)
    .in("id", employeeIds);
  const employees = (empRows ?? []).map((e) => ({
    id: e.id,
    maxDays: caps[e.id]?.maxDays ?? e.max_days_per_week,
    daysOff: caps[e.id]?.daysOff ?? e.weekly_days_off,
  }));
  if (employees.length === 0) return { ok: false, error: "No employees selected." };

  const { data: tplRows } = await supabase
    .from("shift_templates")
    .select("id, name, start_time, end_time, default_headcount")
    .eq("location_id", locationId)
    .eq("active", true);
  const templates = tplRows ?? [];
  const slots: MixerSlot[] = SHIFT_SLOTS.map((slot) => {
    const tpl = templateForSlot(slot, templates);
    return {
      key: slot.key,
      templateId: tpl?.id ?? null,
      start: slot.start,
      end: slot.end,
      headcount: headcounts[slot.key] ?? tpl?.default_headcount ?? 0,
    };
  });

  // Approved time-off intersecting the week → per-day off flags.
  const { data: offRows } = await supabase
    .from("time_off_requests")
    .select("employee_id, start_date, end_date")
    .eq("status", "approved")
    .in("employee_id", employeeIds)
    .lte("start_date", days[days.length - 1])
    .gte("end_date", days[0]);
  const timeOff: { employeeId: string; date: string }[] = [];
  for (const o of offRows ?? []) {
    for (const d of days) if (d >= o.start_date && d <= o.end_date) timeOff.push({ employeeId: o.employee_id, date: d });
  }

  const { data: shiftRows } = await supabase
    .from("shifts")
    .select("id, employee_id, date, shift_template_id, start_time, end_time")
    .eq("schedule_id", scheduleId);
  const existingShifts = shiftRows ?? [];

  if (mode === "scratch" && existingShifts.length > 0) {
    const del = await supabase.from("shifts").delete().eq("schedule_id", scheduleId);
    if (del.error) return { ok: false, error: dbError(del.error) };
  }

  const existing: MixerPlacement[] =
    mode === "complete"
      ? existingShifts.flatMap((s) => {
          const slot = SHIFT_SLOTS.find((sl) => shiftMatchesSlot(s, sl, templateForSlot(sl, templates)));
          return slot && employeeIds.includes(s.employee_id)
            ? [{ employeeId: s.employee_id, date: s.date, slotKey: slot.key }]
            : [];
        })
      : [];

  const { assignments, gaps } = fillSchedule({ days, employees, slots, timeOff, existing, seed });

  if (assignments.length > 0) {
    const slotByKey = new Map(slots.map((s) => [s.key, s]));
    const rows = assignments.map((a) => {
      const slot = slotByKey.get(a.slotKey)!;
      return {
        schedule_id: scheduleId,
        employee_id: a.employeeId,
        date: a.date,
        shift_template_id: slot.templateId,
        start_time: slot.start,
        end_time: slot.end,
        notes: null,
      };
    });
    const { error } = await supabase.from("shifts").insert(rows);
    if (error) return { ok: false, error: dbError(error) };
  }

  revalidatePath("/admin/schedules");
  return { ok: true, data: { added: assignments.length, gaps: gaps.reduce((s, g) => s + g.short, 0) } };
}

const hhmm = (t: string) => t.slice(0, 5);

type EmailShift = {
  id: string;
  employee_id: string;
  date: string;
  shift_template_id: string | null;
  start_time: string;
  end_time: string;
};

type EmailCtx = {
  location: { name: string; address: string | null; timezone: string };
  weekRange: string;
  templateName: Map<string, string>;
  appUrl: string;
  // The whole week's shifts + a name map, so each shift can list who else is on
  // it (overlapping hours). Both send paths supply these.
  allShifts: EmailShift[];
  employeeName: Map<string, string>;
};

/** One employee's published-week email (+ .ics) — used by publish and resend. */
async function sendScheduleEmailTo(
  emp: { name: string; email: string; magic_token: string },
  empShifts: EmailShift[],
  ctx: EmailCtx,
): Promise<{ ok: boolean; error?: string }> {
  const label = (s: EmailShift) =>
    s.shift_template_id
      ? (ctx.templateName.get(s.shift_template_id) ?? null)
      : slotLabelForHours(s.start_time, s.end_time);
  const coworkersOf = (s: EmailShift) =>
    overlappingCoworkerNames(s, ctx.allShifts, ctx.employeeName);

  const ics = buildEmployeeFeed({
    employeeName: emp.name,
    location: ctx.location,
    shifts: empShifts.map((s) => ({
      id: s.id,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time,
      templateName: label(s),
      coworkers: coworkersOf(s),
    })),
  });

  const res = await sendSafe({
    to: emp.email,
    subject: `Your schedule for ${ctx.weekRange} is published`,
    react: React.createElement(SchedulePublishedEmail, {
      employeeName: emp.name,
      locationName: ctx.location.name,
      weekRange: ctx.weekRange,
      scheduleUrl: `${ctx.appUrl}/s/${emp.magic_token}`,
      shifts: empShifts.map((s) => ({
        date: `${SHORT_WEEKDAYS[isoWeekday(s.date) - 1]} ${s.date.slice(8, 10)}`,
        label: label(s) ?? (s.shift_template_id ? "Shift" : "Custom"),
        time: `${hhmm(s.start_time)}–${hhmm(s.end_time)}`,
        coworkers: coworkersOf(s).join(", "),
      })),
    }),
    attachments: [{ filename: "schedule.ics", content: ics }],
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

const sortShifts = (a: EmailShift, b: EmailShift) =>
  a.date === b.date
    ? a.start_time.localeCompare(b.start_time)
    : a.date.localeCompare(b.date);

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
      "id, name, email, magic_token, weekly_hour_target, max_days_per_week, weekly_days_off",
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

  const ctx: EmailCtx = {
    location: loc.data,
    weekRange: formatWeekRange(sched.data.week_start),
    templateName: new Map(templates.map((t) => [t.id, t.name])),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
    allShifts: shifts,
    employeeName: new Map(employees.map((e) => [e.id, e.name])),
  };

  let sent = 0;
  let total = 0;
  for (const emp of employees) {
    const empShifts = shifts
      .filter((s) => s.employee_id === emp.id)
      .sort(sortShifts);
    if (empShifts.length === 0) continue;
    total++;
    const res = await sendScheduleEmailTo(emp, empShifts, ctx);
    if (res.ok) sent++;
  }

  revalidatePath("/admin/schedules");
  return { ok: true, data: { sent, total } };
}

/**
 * Re-send one employee their published-week email (same content as publish) —
 * for a fixed email address, a missed delivery, or a post-publish edit that
 * only affects them.
 */
export async function resendScheduleEmail(
  scheduleId: string,
  employeeId: string,
): Promise<ActionResult<{ email: string }>> {
  const admin = await requireAdmin();
  if (!uuid.safeParse(scheduleId).success || !uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid id." };
  }

  const supabase = await createServerClient();

  const sched = await supabase
    .from("schedules")
    .select("id, location_id, week_start, status")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!sched.data) return { ok: false, error: "Schedule not found." };
  if (sched.data.status !== "published") {
    return { ok: false, error: "Publish the schedule first." };
  }

  // Load the WHOLE week's shifts (not just this employee's) + the location's
  // employee names, so each shift can list who else is on it (overlapping hours).
  const [{ data: loc }, { data: emp }, shiftsRes, templatesRes, rosterRes] =
    await Promise.all([
      supabase
        .from("locations")
        .select("name, address, timezone")
        .eq("id", sched.data.location_id)
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id, name, email, magic_token, location_id, active")
        .eq("id", employeeId)
        .maybeSingle(),
      supabase
        .from("shifts")
        .select("id, employee_id, date, shift_template_id, start_time, end_time")
        .eq("schedule_id", scheduleId),
      supabase
        .from("shift_templates")
        .select("id, name")
        .eq("location_id", sched.data.location_id),
      supabase
        .from("employees")
        .select("id, name")
        .eq("location_id", sched.data.location_id),
    ]);
  if (!loc) return { ok: false, error: "Location not found." };
  if (!emp || !emp.active || emp.location_id !== sched.data.location_id) {
    return { ok: false, error: "That employee isn't at this store." };
  }

  const allShifts = shiftsRes.data ?? [];
  const empShifts = allShifts
    .filter((s) => s.employee_id === employeeId)
    .sort(sortShifts);
  if (empShifts.length === 0) {
    return { ok: false, error: `${emp.name} has no shifts this week.` };
  }

  const res = await sendScheduleEmailTo(emp, empShifts, {
    location: loc,
    weekRange: formatWeekRange(sched.data.week_start),
    templateName: new Map((templatesRes.data ?? []).map((t) => [t.id, t.name])),
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
    allShifts,
    employeeName: new Map((rosterRes.data ?? []).map((e) => [e.id, e.name])),
  });
  if (!res.ok) return { ok: false, error: res.error ?? "The email couldn't be sent." };

  const service = createServiceClient();
  await service.from("audit_log").insert({
    actor: admin.id,
    action: "schedule.email_resent",
    entity: "schedule",
    entity_id: scheduleId,
    diff: { employee_id: emp.id, week_start: sched.data.week_start },
  });

  return { ok: true, data: { email: emp.email } };
}
