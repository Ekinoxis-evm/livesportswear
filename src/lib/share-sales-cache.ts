import "server-only";
import { unstable_cache } from "next/cache";
import { fetchStaffSales } from "@/lib/shopify";
import { weekRangeInTz } from "@/lib/shopify-range";

/**
 * Week-sales cache for the public share page. One Shopify read per
 * (location, week) per 10 minutes, revalidatable on demand via a per-entry
 * tag so the page's Refresh button can force a pull. `fetchedAt` rides inside
 * the cached value: it's the refresh action's cooldown clock, shared across
 * serverless instances because it lives in the Next data cache.
 */

export function weekSalesTag(locationId: string, monday: string): string {
  return `share-week-sales:${locationId}:${monday}`;
}

export type ShareWeekSales = {
  entries: [staffId: string, amount: number][];
  fetchedAt: number;
};

// The wrapper is built per call: unstable_cache tags must be known at wrap
// time, and ours vary by (location, week). Key parts still include the args,
// so entries never collide. Don't "simplify" this back to a static tag.
export function getShareWeekSales(
  locationId: string,
  monday: string,
  tz: string,
): Promise<ShareWeekSales> {
  return unstable_cache(
    async () => {
      const range = weekRangeInTz(monday, tz);
      const { totals } = await fetchStaffSales(range.start, range.endExclusive);
      return { entries: [...totals.entries()], fetchedAt: Date.now() };
    },
    ["share-week-sales", locationId, monday],
    { revalidate: 600, tags: [weekSalesTag(locationId, monday)] },
  )();
}
