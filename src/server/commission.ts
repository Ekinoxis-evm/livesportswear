"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { type ActionResult, dbError, firstError } from "@/server/shared";

const tiersSchema = z.object({
  tiers: z
    .array(
      z.object({
        min_sales: z.coerce.number().min(0),
        rate: z.coerce.number().min(0).max(1),
      }),
    )
    .min(1, "Add at least one tier."),
});

export async function setCommissionConfig(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = tiersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const tiers = [...parsed.data.tiers].sort((a, b) => a.min_sales - b.min_sales);
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("commission_config")
    .update({ tiers })
    .eq("id", 1);
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/commission");
  return { ok: true };
}

const currencySchema = z.object({ currency: z.string().trim().min(1).max(8) });

export async function setCurrency(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = currencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("commission_config")
    .update({ currency: parsed.data.currency.toUpperCase() })
    .eq("id", 1);
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/settings");
  revalidatePath("/admin/commission");
  return { ok: true };
}

const salesSchema = z.object({
  employee_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM."),
  amount: z.coerce.number().min(0),
});

export async function setMonthlySales(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = salesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("monthly_sales")
    .upsert(
      { ...parsed.data, source: "manual" },
      { onConflict: "employee_id,month" },
    );
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/commission");
  return { ok: true };
}
