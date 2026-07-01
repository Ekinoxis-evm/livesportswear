"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { type ActionResult, dbError } from "@/server/shared";

const schema = z.object({
  location_id: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  currency: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().max(8).optional(),
  ),
  goals: z
    .array(
      z.object({
        month: z.coerce.number().int().min(1).max(12),
        goal_amount: z.coerce.number().min(0),
      }),
    )
    .max(12),
});

/** Upsert a location's monthly sales goals for a year (admin only). */
export async function setStoreGoals(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { location_id, year, currency, goals } = parsed.data;
  const rows = goals.map((g) => ({
    location_id,
    year,
    month: g.month,
    goal_amount: g.goal_amount,
    currency: currency ?? null,
  }));

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("store_goals")
    .upsert(rows, { onConflict: "location_id,year,month" });
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/settings");
  revalidatePath("/admin/commission");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

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

const tiersSchema = z.object({
  location_id: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  tiers: z
    .array(
      z.object({
        min_sales: z.coerce.number().min(0),
        rate: z.coerce.number().min(0).max(1),
      }),
    )
    .max(10),
});

/** Set a store's commission tiers for one month (empty clears → global fallback). */
export async function setStoreTiers(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = tiersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid tiers." };
  const { location_id, year, month, tiers } = parsed.data;

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("store_goals")
    .upsert(
      { location_id, year, month, tiers: tiers.length ? tiers : null },
      { onConflict: "location_id,year,month" },
    );
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/commission");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}
