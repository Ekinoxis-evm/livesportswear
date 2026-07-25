"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { generateMagicToken } from "@/lib/magic-token";
import { AVATAR_COLORS, pickAvatarColor } from "@/lib/avatar-palette";
import { inviteEmployee } from "@/server/employee-accounts";
import {
  type ActionResult,
  emptyToNull,
  firstError,
  dbError,
} from "@/server/shared";

const EMAIL_TAKEN = { "23505": "That email is already in use." };

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #1ea7fd.");

const employeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  phone: z.preprocess(emptyToNull, z.string().trim().max(40).nullable()),
  avatar_color: z.preprocess(emptyToNull, hexColor.nullable()),
  role: z.enum(["sales_rep", "shift_lead", "store_manager"]),
  location_id: z.string().uuid("Pick a location."),
  weekly_hour_target: z.coerce.number().int().min(0).max(80),
  max_days_per_week: z.coerce.number().int().min(1).max(7),
  weekly_days_off: z.coerce.number().int().min(0).max(6),
  hire_date: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
      .nullable(),
  ),
  active: z.boolean(),
});

const hourlyRate = z.preprocess(
  emptyToNull,
  z.coerce.number().min(0).max(100000).nullable(),
);

const withAccessSchema = employeeSchema.extend({
  hourly_rate: hourlyRate,
  invite: z.boolean().default(false),
});

// Edit form carries the (optional) hourly rate alongside the core fields.
const editSchema = employeeSchema.extend({
  hourly_rate: hourlyRate.optional(),
});

const uuid = z.string().uuid();

export async function createEmployee(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("employees")
    .insert({
      ...parsed.data,
      // Every employee gets a color even if the form didn't send one.
      avatar_color:
        parsed.data.avatar_color ??
        pickAvatarColor(Math.floor(Math.random() * AVATAR_COLORS.length)),
      magic_token: generateMagicToken(),
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: dbError(error, EMAIL_TAKEN) };
  revalidatePath("/admin/employees");
  return { ok: true, data: { id: data.id } };
}

export async function updateEmployee(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(id).success) {
    return { ok: false, error: "Invalid employee id." };
  }
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { hourly_rate, ...employee } = parsed.data;

  const supabase = await createServerClient();

  // Email change forces a magic-token rotation (security.md).
  const { data: current, error: readError } = await supabase
    .from("employees")
    .select("email")
    .eq("id", id)
    .single();
  if (readError) return { ok: false, error: dbError(readError) };

  const rotate = current.email.toLowerCase() !== employee.email.toLowerCase();

  const { error } = await supabase
    .from("employees")
    .update({
      ...employee,
      ...(rotate ? { magic_token: generateMagicToken() } : {}),
    })
    .eq("id", id);

  if (error) return { ok: false, error: dbError(error, EMAIL_TAKEN) };

  // Hourly rate (private, employee_compensation) is edited here too.
  if (hourly_rate !== undefined) {
    const { error: compErr } = await supabase
      .from("employee_compensation")
      .upsert({ employee_id: id, hourly_rate }, { onConflict: "employee_id" });
    if (compErr) return { ok: false, error: dbError(compErr) };
  }

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  return { ok: true };
}

export async function setEmployeeActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(id).success) {
    return { ok: false, error: "Invalid employee id." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("employees")
    .update({ active })
    .eq("id", id);

  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/employees");
  return { ok: true };
}

/**
 * Wizard entry point: create the employee, set their (private) hourly rate, and
 * optionally send the portal invite — in one step. Employee is still created if
 * the invite later fails (admin can retry from the detail page).
 */
export async function createEmployeeWithAccess(
  input: unknown,
): Promise<ActionResult<{ id: string; invited: boolean; inviteError?: string }>> {
  await requireAdmin();
  const parsed = withAccessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { hourly_rate, invite, ...employee } = parsed.data;

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("employees")
    .insert({
      ...employee,
      avatar_color:
        employee.avatar_color ??
        pickAvatarColor(Math.floor(Math.random() * AVATAR_COLORS.length)),
      magic_token: generateMagicToken(),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbError(error, EMAIL_TAKEN) };
  const id = data.id;

  if (hourly_rate != null) {
    await supabase
      .from("employee_compensation")
      .upsert({ employee_id: id, hourly_rate }, { onConflict: "employee_id" });
  }

  let invited = false;
  let inviteError: string | undefined;
  if (invite) {
    const res = await inviteEmployee(id);
    invited = res.ok;
    if (!res.ok) inviteError = res.error;
  }

  revalidatePath("/admin/employees");
  return { ok: true, data: { id, invited, inviteError } };
}

export async function rotateMagicToken(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(id).success) {
    return { ok: false, error: "Invalid employee id." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("employees")
    .update({ magic_token: generateMagicToken() })
    .eq("id", id);

  if (error) return { ok: false, error: dbError(error) };
  revalidatePath("/admin/employees");
  return { ok: true };
}
