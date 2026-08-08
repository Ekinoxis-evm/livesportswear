"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireStore, accessibleLocationIds } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { firstError, dbError, type ActionResult } from "@/server/shared";

const uuid = z.string().uuid();
const hhmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 10:00.");

/** The current admin must be able to manage this location. */
async function canAccess(locationId: string): Promise<boolean> {
  const access = await accessibleLocationIds();
  return access === "all" || access.includes(locationId);
}

// ---------------------------------------------------------------------------
// Admin — owning the schedule. RLS-enforced through createServerClient.
// ---------------------------------------------------------------------------

const saveSchema = z.object({
  id: uuid.optional(),
  location_id: uuid,
  label: z.string().trim().min(1, "Give the reminder a name.").max(80),
  note: z.string().trim().max(200).optional(),
  start_time: hhmm,
  end_time: hhmm,
  interval_minutes: z.number().int().min(15).max(720),
});

export async function saveReminder(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { id, location_id, note, ...fields } = parsed.data;
  if (!(await canAccess(location_id)))
    return { ok: false, error: "You can't manage that location." };
  if (fields.end_time < fields.start_time)
    return { ok: false, error: "The end time can't be before the start." };

  const supabase = await createServerClient();
  const row = { ...fields, note: note || null, location_id };
  const { error } = id
    ? await supabase.from("store_reminders").update(row).eq("id", id)
    : await supabase
        .from("store_reminders")
        .insert({ ...row, created_by: admin.id });
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/locations");
  return { ok: true };
}

const toggleSchema = z.object({ id: uuid, active: z.boolean() });

export async function setReminderActive(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("store_reminders")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/locations");
  return { ok: true };
}

export async function deleteReminder(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.object({ id: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("store_reminders")
    .delete()
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/locations");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Kiosk — clearing a due slot. Service client, re-scoped to the JWT's location:
// the store screen has no employees row and never gets an RLS policy of its own,
// same single-writer posture as the rest of the floor.
// ---------------------------------------------------------------------------

const ackSchema = z.object({
  reminder_id: uuid,
  // The slot the popup was showing. Sent by the client, but only ever recorded
  // against a reminder that belongs to this kiosk's location and today's date.
  due_at: hhmm,
});

export async function storeAckReminder(input: unknown): Promise<ActionResult> {
  const { locationId } = await requireStore();
  const parsed = ackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const service = createServiceClient();

  const { data: reminder } = await service
    .from("store_reminders")
    .select("id, location_id")
    .eq("id", parsed.data.reminder_id)
    .maybeSingle();
  if (!reminder || reminder.location_id !== locationId)
    return { ok: false, error: "That reminder isn't for this store." };

  const { data: loc } = await service
    .from("locations")
    .select("timezone")
    .eq("id", locationId)
    .maybeSingle();

  // Idempotent by construction: (reminder, date, slot) is the primary key, so a
  // double tap or a retry lands on the same row instead of a duplicate.
  const { error } = await service.from("store_reminder_acks").upsert(
    {
      reminder_id: reminder.id,
      business_date: businessDate(loc?.timezone ?? "UTC"),
      due_at: parsed.data.due_at,
    },
    { onConflict: "reminder_id,business_date,due_at", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/store", "layout");
  return { ok: true };
}
