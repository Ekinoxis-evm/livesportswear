"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { type ActionResult, dbError, firstError } from "@/server/shared";

const schema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  entries: z
    .array(
      z.object({
        employee_id: z.string().uuid(),
        goal_amount: z.coerce.number().min(0),
      }),
    )
    .max(100),
});

/** Set each rep's monthly sales target for one month, in one save. */
export async function setEmployeeGoals(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { year, month, entries } = parsed.data;

  const supabase = await createServerClient();
  const { error } = await supabase.from("employee_goals").upsert(
    entries.map((e) => ({ ...e, year, month })),
    { onConflict: "employee_id,year,month" },
  );
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/commission");
  return { ok: true };
}
