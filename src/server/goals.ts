"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { type ActionResult, dbError } from "@/server/shared";

const monthSchema = z.object({
  location_id: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  goal_amount: z.coerce.number().min(0),
  tiers: z
    .array(
      z.object({
        min_sales: z.coerce.number().min(0),
        rate: z.coerce.number().min(0).max(1),
      }),
    )
    .max(10),
});

/** Set a store's goal AND commission tiers for one month, in one save. */
export async function setStoreMonth(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = monthSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { location_id, year, month, goal_amount, tiers } = parsed.data;

  const supabase = await createServerClient();
  const { error } = await supabase.from("store_goals").upsert(
    { location_id, year, month, goal_amount, tiers: tiers.length ? tiers : null },
    { onConflict: "location_id,year,month" },
  );
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/commission");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}
