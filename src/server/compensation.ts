"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { type ActionResult, dbError, firstError } from "@/server/shared";

const schema = z.object({
  employee_id: z.string().uuid(),
  hourly_rate: z.coerce.number().min(0).max(100000),
});

/** Admin-only. Hourly rate lives in employee_compensation (private from employees). */
export async function setHourlyRate(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("employee_compensation")
    .upsert(
      { employee_id: parsed.data.employee_id, hourly_rate: parsed.data.hourly_rate },
      { onConflict: "employee_id" },
    );
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath(`/admin/employees/${parsed.data.employee_id}`);
  return { ok: true };
}
