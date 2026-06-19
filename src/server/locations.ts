"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { isValidTimezone } from "@/lib/timezones";
import {
  type ActionResult,
  emptyToNull,
  firstError,
  dbError,
} from "@/server/shared";

const locationSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required.")
    .max(120)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase letters, numbers, and hyphens.",
    ),
  address: z.preprocess(emptyToNull, z.string().trim().max(300).nullable()),
  timezone: z.string().refine(isValidTimezone, "Unknown timezone."),
  color: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1ea7fd.")
      .nullable(),
  ),
  active: z.boolean(),
});

const SLUG_TAKEN = { "23505": "That slug is already in use." };

export async function createLocation(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("locations")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return { ok: false, error: dbError(error, SLUG_TAKEN) };
  revalidatePath("/admin/locations");
  return { ok: true, data: { id: data.id } };
}

export async function updateLocation(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid location id." };
  }
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("locations")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { ok: false, error: dbError(error, SLUG_TAKEN) };
  revalidatePath("/admin/locations");
  return { ok: true };
}

export async function setLocationActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid location id." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("locations")
    .update({ active })
    .eq("id", id);

  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/locations");
  return { ok: true };
}
