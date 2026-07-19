import "server-only";
import { unstable_cache } from "next/cache";
import { fetchStaffSales } from "@/lib/shopify";
import { weekRangeInTz, dayRangeInTz } from "@/lib/shopify-range";
import type { SalesBreakdown } from "@/lib/sales-breakdown";

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
  entries: [staffId: string, sales: SalesBreakdown][];
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

export function daySalesTag(locationId: string, date: string): string {
  return `share-day-sales:${locationId}:${date}`;
}

/**
 * Day-sales cache for the public share page's "Today" pill — same distributed
 * posture as the week cache so bursty anonymous traffic can't multiply
 * Shopify calls (the in-memory range cache is per-instance and won't do).
 */
export function getShareDaySales(
  locationId: string,
  date: string,
  tz: string,
): Promise<ShareWeekSales> {
  return unstable_cache(
    async () => {
      const range = dayRangeInTz(date, tz);
      const { totals } = await fetchStaffSales(range.start, range.endExclusive);
      return { entries: [...totals.entries()], fetchedAt: Date.now() };
    },
    ["share-day-sales", locationId, date],
    { revalidate: 600, tags: [daySalesTag(locationId, date)] },
  )();
}
