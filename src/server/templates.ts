"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  type ActionResult,
  emptyToNull,
  firstError,
  dbError,
} from "@/server/shared";

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM.");

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const templateSchema = z
  .object({
    location_id: z.string().uuid("Pick a location."),
    name: z.string().trim().min(1, "Name is required.").max(80),
    start_time: time,
    end_time: time,
    color: z.preprocess(
      emptyToNull,
      z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1ea7fd.")
        .nullable(),
    ),
    default_headcount: z.coerce.number().int().min(0).max(50),
    active: z.boolean(),
  })
  .refine((d) => toMinutes(d.start_time) < toMinutes(d.end_time), {
    message: "End time must be after start time.",
    path: ["end_time"],
  });

const uuid = z.string().uuid();

export async function createTemplate(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("shift_templates")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/templates");
  return { ok: true, data: { id: data.id } };
}

export async function updateTemplate(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(id).success) {
    return { ok: false, error: "Invalid template id." };
  }
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("shift_templates")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/templates");
  return { ok: true };
}

export async function setTemplateActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(id).success) {
    return { ok: false, error: "Invalid template id." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("shift_templates")
    .update({ active })
    .eq("id", id);

  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/templates");
  return { ok: true };
}
