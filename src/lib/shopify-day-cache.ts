import "server-only";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { fetchDaySales, type DaySales } from "@/lib/shopify";
import { dayRangeInTz } from "@/lib/shopify-range";

// The kiosk auto-refreshes every 45s all day; a short TTL keeps the
// Performance page from re-paginating Shopify orders on every refresh.
const TTL_MS = 60_000;

let cache: { key: string; at: number; data: DaySales } | null = null;

/** Day sales for the store's business date; null when unconfigured or Shopify is down. */
export async function getDaySalesCached(
  businessDate: string,
  tz: string,
): Promise<DaySales | null> {
  if (!isShopifyConfigured()) return null;
  const key = `${businessDate}:${tz}`;
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }
  try {
    const range = dayRangeInTz(businessDate, tz);
    const data = await fetchDaySales(range.start, range.endExclusive);
    cache = { key, at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}
