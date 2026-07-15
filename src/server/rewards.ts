"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { type ActionResult, dbError, firstError } from "@/server/shared";

const prizeSchema = z.object({
  prize: z.string().trim().min(1, "Every place needs a prize.").max(120),
  min_sales: z.coerce.number().min(0).nullable(),
});

const contestSchema = z
  .object({
    location_id: z.string().uuid(),
    name: z.string().trim().min(1, "Name the contest.").max(80),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    store_threshold: z.coerce.number().min(0),
    prizes: z.array(prizeSchema).min(1, "Add at least one place.").max(10),
  })
  .refine((c) => c.end_date >= c.start_date, {
    message: "End date must be on or after the start.",
  });

// Places are always the row order — the client can't desync numbering.
function numberedPrizes(prizes: z.infer<typeof prizeSchema>[]) {
  return prizes.map((p, i) => ({ ...p, place: i + 1 }));
}

function revalidateRewards() {
  revalidatePath("/admin/rewards");
  revalidatePath("/portal/rewards");
  revalidatePath("/store/rewards");
}

export async function createContest(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const parsed = contestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { prizes, ...rest } = parsed.data;

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("sales_contests")
    .insert({ ...rest, prizes: numberedPrizes(prizes) })
    .select("id")
    .single();
  if (error) return { ok: false, error: dbError(error) };

  revalidateRewards();
  return { ok: true, data: { id: data.id } };
}

export async function updateContest(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = contestSchema
    .safeParse(input && typeof input === "object" ? input : {});
  const id = z
    .string()
    .uuid()
    .safeParse((input as { id?: unknown })?.id);
  if (!parsed.success || !id.success) {
    return { ok: false, error: parsed.success ? "Invalid input." : firstError(parsed.error) };
  }
  const { prizes, ...rest } = parsed.data;

  const supabase = await createServerClient();
  const { data: existing } = await supabase
    .from("sales_contests")
    .select("results")
    .eq("id", id.data)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Contest not found." };
  if (existing.results !== null) {
    return { ok: false, error: "Contest already finalized." };
  }

  const { error } = await supabase
    .from("sales_contests")
    .update({ ...rest, prizes: numberedPrizes(prizes) })
    .eq("id", id.data);
  if (error) return { ok: false, error: dbError(error) };

  revalidateRewards();
  return { ok: true };
}

export async function deleteContest(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const id = z.string().uuid().safeParse(input);
  if (!id.success) return { ok: false, error: "Invalid input." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("sales_contests")
    .delete()
    .eq("id", id.data);
  if (error) return { ok: false, error: dbError(error) };

  revalidateRewards();
  return { ok: true };
}
