"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { isMonday, addDays } from "@/lib/scheduling/week";
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
