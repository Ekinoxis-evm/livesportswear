"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { isValidDateStr, weekDays } from "@/lib/scheduling/week";
import { toMinutes } from "@/lib/scheduling/conflicts";
import {
  type ActionResult,
  emptyToNull,
  firstError,
  dbError,
} from "@/server/shared";

const uuid = z.string().uuid();
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM.");

// When custom times are given (no template), end must be after start.
const endAfterStart = (d: {
  start_time?: string | null;
  end_time?: string | null;
}) =>
  !d.start_time || !d.end_time || toMinutes(d.end_time) > toMinutes(d.start_time);
const endAfterStartError = {
  message: "End time must be after start time.",
  path: ["end_time"],
};

const createSchema = z
  .object({
    schedule_id: uuid,
    employee_id: uuid,
    date: z.string().refine(isValidDateStr, "Invalid date."),
    shift_template_id: z.preprocess(emptyToNull, uuid.nullable().optional()),
    start_time: z.preprocess(emptyToNull, time.nullable().optional()),
    end_time: z.preprocess(emptyToNull, time.nullable().optional()),
    notes: z.preprocess(emptyToNull, z.string().max(500).nullable()),
  })
  .refine(endAfterStart, endAfterStartError);

const updateSchema = z
  .object({
    shift_template_id: z.preprocess(emptyToNull, uuid.nullable().optional()),
    start_time: z.preprocess(emptyToNull, time.nullable().optional()),
    end_time: z.preprocess(emptyToNull, time.nullable().optional()),
    notes: z.preprocess(emptyToNull, z.string().max(500).nullable()),
  })
  .refine(endAfterStart, endAfterStartError);

/** Resolves shift times from a template (authoritative) or explicit inputs. */
async function resolveTimes(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  locationId: string,
  templateId: string | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined,
): Promise<
  | { ok: true; start: string; end: string }
  | { ok: false; error: string }
> {
  if (templateId) {
    const tpl = await supabase
      .from("shift_templates")
      .select("location_id, start_time, end_time")
      .eq("id", templateId)
      .single();
    if (tpl.error || !tpl.data) return { ok: false, error: "Template not found." };
    if (tpl.data.location_id !== locationId) {
      return { ok: false, error: "That template belongs to another location." };
    }
    return {
      ok: true,
      start: tpl.data.start_time.slice(0, 5),
      end: tpl.data.end_time.slice(0, 5),
    };
  }
  if (!start || !end) {
    return { ok: false, error: "Pick a template or enter start and end times." };
  }
  return { ok: true, start, end };
}

export async function createShift(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();

  const schedule = await supabase
    .from("schedules")
    .select("location_id, week_start")
    .eq("id", parsed.data.schedule_id)
    .single();
  if (schedule.error || !schedule.data) {
    return { ok: false, error: "Schedule not found." };
  }
  if (!weekDays(schedule.data.week_start).includes(parsed.data.date)) {
    return { ok: false, error: "That date is outside the schedule week." };
  }

  const times = await resolveTimes(
    supabase,
    schedule.data.location_id,
    parsed.data.shift_template_id,
    parsed.data.start_time,
    parsed.data.end_time,
  );
  if (!times.ok) return times;

  const { data, error } = await supabase
    .from("shifts")
    .insert({
      schedule_id: parsed.data.schedule_id,
      employee_id: parsed.data.employee_id,
      date: parsed.data.date,
      shift_template_id: parsed.data.shift_template_id ?? null,
      start_time: times.start,
      end_time: times.end,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/schedules");
  return { ok: true, data: { id: data.id } };
}

export async function updateShift(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(id).success) {
    return { ok: false, error: "Invalid shift id." };
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();

  const shift = await supabase
    .from("shifts")
    .select("schedule_id, schedules(location_id)")
    .eq("id", id)
    .single();
  if (shift.error || !shift.data) {
    return { ok: false, error: "Shift not found." };
  }
  const joined = shift.data.schedules as
    | { location_id: string }
    | { location_id: string }[]
    | null;
  const locationId = Array.isArray(joined)
    ? joined[0]?.location_id
    : joined?.location_id;
  if (!locationId) {
    return { ok: false, error: "Shift not found." };
  }

  const times = await resolveTimes(
    supabase,
    locationId,
    parsed.data.shift_template_id,
    parsed.data.start_time,
    parsed.data.end_time,
  );
  if (!times.ok) return times;

  const { error } = await supabase
    .from("shifts")
    .update({
      shift_template_id: parsed.data.shift_template_id ?? null,
      start_time: times.start,
      end_time: times.end,
      notes: parsed.data.notes,
    })
    .eq("id", id);

  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/schedules");
  return { ok: true };
}

/**
 * Load a shift the current admin may edit (RLS scopes to their locations) and
 * return its id + schedule location for the times resolver.
 */
async function loadOwnedShift(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  id: string,
): Promise<{ ok: true; locationId: string } | { ok: false; error: string }> {
  const shift = await supabase
    .from("shifts")
    .select("id, schedules(location_id)")
    .eq("id", id)
    .single();
  if (shift.error || !shift.data) return { ok: false, error: "Shift not found." };
  const joined = shift.data.schedules as
    | { location_id: string }
    | { location_id: string }[]
    | null;
  const locationId = Array.isArray(joined) ? joined[0]?.location_id : joined?.location_id;
  if (!locationId) return { ok: false, error: "Shift not found." };
  return { ok: true, locationId };
}

const moveSchema = z
  .object({
    date: z.string().refine(isValidDateStr, "Invalid date."),
    shift_template_id: z.preprocess(emptyToNull, uuid.nullable().optional()),
    start_time: z.preprocess(emptyToNull, time.nullable().optional()),
    end_time: z.preprocess(emptyToNull, time.nullable().optional()),
  })
  .refine(endAfterStart, endAfterStartError);

/**
 * Drag-and-drop MOVE: relocate a shift to another cell (day + slot). Sets the
 * new date, template and the template's/explicit times — the person stays.
 */
export async function moveShift(id: string, input: unknown): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Invalid shift id." };
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const owned = await loadOwnedShift(supabase, id);
  if (!owned.ok) return owned;

  const times = await resolveTimes(
    supabase,
    owned.locationId,
    parsed.data.shift_template_id,
    parsed.data.start_time,
    parsed.data.end_time,
  );
  if (!times.ok) return times;

  const { error } = await supabase
    .from("shifts")
    .update({
      date: parsed.data.date,
      shift_template_id: parsed.data.shift_template_id ?? null,
      start_time: times.start,
      end_time: times.end,
    })
    .eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/schedules");
  return { ok: true };
}

/**
 * Drag-and-drop SWAP: two shifts exchange their employee (each keeps its cell +
 * time), so dropping one person onto another swaps their spots and leaves no
 * slot empty. Both must be shifts the admin can edit (RLS-scoped).
 */
export async function swapShifts(aId: string, bId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(aId).success || !uuid.safeParse(bId).success || aId === bId) {
    return { ok: false, error: "Invalid shifts." };
  }
  const supabase = await createServerClient();
  const { data: rows, error } = await supabase
    .from("shifts")
    .select("id, employee_id")
    .in("id", [aId, bId]);
  if (error) return { ok: false, error: dbError(error) };
  if (!rows || rows.length !== 2) return { ok: false, error: "Shift not found." };

  const a = rows.find((r) => r.id === aId)!;
  const b = rows.find((r) => r.id === bId)!;
  if (a.employee_id === b.employee_id) return { ok: true }; // same person — nothing to swap

  const [ua, ub] = await Promise.all([
    supabase.from("shifts").update({ employee_id: b.employee_id }).eq("id", aId),
    supabase.from("shifts").update({ employee_id: a.employee_id }).eq("id", bId),
  ]);
  if (ua.error || ub.error) return { ok: false, error: dbError(ua.error ?? ub.error!) };
  revalidatePath("/admin/schedules");
  return { ok: true };
}

export async function deleteShift(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(id).success) {
    return { ok: false, error: "Invalid shift id." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/schedules");
  return { ok: true };
}
