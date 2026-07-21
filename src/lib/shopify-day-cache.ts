import "server-only";
import { isShopifyConfigured } from "@/lib/shopify-config";
import {
  fetchDaySales,
  fetchDayOrders,
  type DaySales,
  type DayOrder,
} from "@/lib/shopify";
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

let ordersCache: { key: string; at: number; data: DayOrder[] } | null = null;

/** The day's individual orders for the store's business date; null when unconfigured/down. */
export async function getDayOrdersCached(
  businessDate: string,
  tz: string,
): Promise<DayOrder[] | null> {
  if (!isShopifyConfigured()) return null;
  const key = `${businessDate}:${tz}`;
  if (ordersCache && ordersCache.key === key && Date.now() - ordersCache.at < TTL_MS) {
    return ordersCache.data;
  }
  try {
    const range = dayRangeInTz(businessDate, tz);
    const data = await fetchDayOrders(range.start, range.endExclusive);
    ordersCache = { key, at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}

let rangeOrdersCache: { key: string; at: number; data: DayOrder[] } | null = null;

/**
 * Individual orders across an arbitrary instant range — the portal's per-period
 * order metrics (count, average ticket, best day). A wide Custom range costs
 * several REST pages, so the same short TTL absorbs re-renders.
 */
export async function getRangeOrdersCached(
  start: string,
  endExclusive: string,
): Promise<DayOrder[] | null> {
  if (!isShopifyConfigured()) return null;
  const key = `${start}:${endExclusive}`;
  if (
    rangeOrdersCache &&
    rangeOrdersCache.key === key &&
    Date.now() - rangeOrdersCache.at < TTL_MS
  ) {
    return rangeOrdersCache.data;
  }
  try {
    const data = await fetchDayOrders(start, endExclusive);
    rangeOrdersCache = { key, at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}
