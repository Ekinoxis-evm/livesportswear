"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { getShareWeekSales, weekSalesTag } from "@/lib/share-sales-cache";
import { weekStart } from "@/lib/scheduling/week";
import type { ActionResult } from "@/server/shared";

const REFRESH_COOLDOWN_MS = 60_000;

const schema = z.object({
  token: z.string().min(20).max(80),
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Public (share-token-gated) refresh of the /w week-sales ranking. The
 * cooldown reads `fetchedAt` from the cached entry itself, so no matter how
 * many viewers tap the button, Shopify sees at most ~1 pull per minute per
 * (location, week).
 */
export async function refreshShareWeekSales(
  input: unknown,
): Promise<ActionResult<{ refreshed: boolean; retryInSeconds?: number }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (!isShopifyConfigured()) return { ok: false, error: "Sales are not connected." };

  const supabase = createServiceClient();
  const { data: loc } = await supabase
    .from("locations")
    .select("id, timezone")
    .eq("share_token", parsed.data.token)
    .maybeSingle();
  if (!loc) return { ok: false, error: "Not found." };

  const monday = weekStart(parsed.data.week);

  const current = await getShareWeekSales(loc.id, monday, loc.timezone);
  const age = Date.now() - current.fetchedAt;
  if (age < REFRESH_COOLDOWN_MS) {
    return {
      ok: true,
      data: {
        refreshed: false,
        retryInSeconds: Math.ceil((REFRESH_COOLDOWN_MS - age) / 1000),
      },
    };
  }

  updateTag(weekSalesTag(loc.id, monday));
  await getShareWeekSales(loc.id, monday, loc.timezone);
  return { ok: true, data: { refreshed: true } };
}
