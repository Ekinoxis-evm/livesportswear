import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The business's reference timezone for admin views that aggregate across stores
 * (dashboard, pay period, monthly sales). Uses the first active location's
 * timezone. Per-employee/per-location views should use that record's own
 * timezone instead. Falls back to UTC only if no active location exists.
 */
export async function primaryTimezone(): Promise<string> {
  const service = createServiceClient();
  const { data } = await service
    .from("locations")
    .select("timezone")
    .eq("active", true)
    .order("name")
    .limit(1)
    .maybeSingle();
  return data?.timezone ?? "UTC";
}
