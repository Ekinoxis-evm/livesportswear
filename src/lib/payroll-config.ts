import { createServerClient } from "@/lib/supabase/server";

/**
 * Pay-period configuration. Sprints are 2 weeks (Mon–Sun ×2); payday is the
 * Friday after a sprint ends. The anchor MUST be a Monday. These live on
 * commission_config (admin-managed in Settings); the constants below are the
 * seed defaults / fallback if the row is missing.
 */
export const DEFAULT_SPRINT_ANCHOR = "2026-06-22";
export const DEFAULT_BIWEEKLY_HOUR_CAP = 80;

export async function getPayPeriod(): Promise<{ anchor: string; cap: number }> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("commission_config")
    .select("sprint_anchor_monday, biweekly_hour_cap")
    .eq("id", 1)
    .maybeSingle();
  return {
    anchor: data?.sprint_anchor_monday ?? DEFAULT_SPRINT_ANCHOR,
    cap: data?.biweekly_hour_cap ?? DEFAULT_BIWEEKLY_HOUR_CAP,
  };
}
