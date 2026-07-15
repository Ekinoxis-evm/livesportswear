import "server-only";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { fetchDaySales, fetchStaffSales, type DaySales } from "@/lib/shopify";

/**
 * Short-TTL cache for arbitrary-range Shopify pulls (date-range sales views,
 * contest standings). Unlike shopify-day-cache's single slot, several ranges
 * can be alive at once — kiosk + admin + portal each pick their own — so this
 * keeps a small keyed map. The 60s TTL absorbs the kiosk's 45s auto-refresh.
 */

const TTL_MS = 60_000;
const MAX_ENTRIES = 20;

export type StaffSalesEntries = [staffId: string, amount: number][];

const staffCache = new Map<string, { at: number; data: StaffSalesEntries }>();
const shopCache = new Map<string, { at: number; data: DaySales }>();

function readFresh<T>(cache: Map<string, { at: number; data: T }>, key: string): T | undefined {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  return undefined;
}

function store<T>(cache: Map<string, { at: number; data: T }>, key: string, data: T) {
  cache.set(key, { at: Date.now(), data });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Per-staff attributed totals for a UTC range; null when unconfigured or Shopify is down. */
export async function getStaffSalesCached(
  start: string,
  endExclusive: string,
): Promise<StaffSalesEntries | null> {
  if (!isShopifyConfigured()) return null;
  const key = `${start}:${endExclusive}`;
  const fresh = readFresh(staffCache, key);
  if (fresh) return fresh;
  try {
    const { totals } = await fetchStaffSales(start, endExclusive);
    const data: StaffSalesEntries = [...totals.entries()];
    store(staffCache, key, data);
    return data;
  } catch {
    return null;
  }
}

/** Whole-shop totals for a UTC range; null when unconfigured or Shopify is down. */
export async function getShopSalesCached(
  start: string,
  endExclusive: string,
): Promise<DaySales | null> {
  if (!isShopifyConfigured()) return null;
  const key = `${start}:${endExclusive}`;
  const fresh = readFresh(shopCache, key);
  if (fresh) return fresh;
  try {
    const data = await fetchDaySales(start, endExclusive);
    store(shopCache, key, data);
    return data;
  } catch {
    return null;
  }
}
