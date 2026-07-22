import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isShopifyConfigured } from "@/lib/shopify-config";
import {
  streamOrdersForAttribution,
  fetchCustomersDetails,
  type ShopifyCustomer,
} from "@/lib/shopify";
import { normalizeStaffId } from "@/lib/shopify-range";
import { countryFromPhone } from "@/lib/phone-country";
import {
  accumulateOrigins,
  unmappedStaffIds,
  type OriginMap,
} from "@/lib/customer-origin";

export type AttributionResult =
  | { ok: true; customers: number; written: number; unmappedStaff: string[] }
  | { ok: false; error: string };

/**
 * Rebuilds `customer_origin` — which rep brought each client in — from Shopify
 * order history. Shares one code path between the full backfill (no `since`,
 * ~39 pages) and the incremental cron pass (`since` = a couple of days back).
 *
 * Runs with the service client: it's called from an admin action and from the
 * cron, and writes across every customer regardless of RLS scope.
 */
export async function runAttributionSync(since?: string): Promise<AttributionResult> {
  if (!isShopifyConfigured()) {
    return { ok: false, error: "Shopify isn't connected yet." };
  }

  const supabase = createServiceClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("active", true)
    .order("name")
    .limit(1)
    .maybeSingle();
  if (!location) return { ok: false, error: "No active location." };

  const origins: OriginMap = new Map();
  try {
    for await (const page of streamOrdersForAttribution(since)) {
      accumulateOrigins(page, origins);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Shopify error." };
  }

  const rows = [...origins.entries()].map(([customerId, o]) => ({
    shopify_customer_id: customerId,
    location_id: location.id,
    first_order_id: o.orderId,
    first_order_name: o.orderName,
    first_order_at: o.at,
    staff_id: o.staffId,
  }));

  // An incremental pass sees only recent orders, so it must never overwrite an
  // older first order it didn't look at — the RPC keeps the earlier row.
  let written = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabase.rpc("upsert_customer_origin", { rows: chunk });
    if (error) return { ok: false, error: error.message };
    written += chunk.length;
  }

  const { data: employees } = await supabase
    .from("employees")
    .select("shopify_staff_id")
    .not("shopify_staff_id", "is", null);
  const mapped = new Set(
    (employees ?? []).map((e) => normalizeStaffId(e.shopify_staff_id as string)),
  );

  return {
    ok: true,
    customers: origins.size,
    written,
    unmappedStaff: unmappedStaffIds(origins, mapped),
  };
}

export type CountrySyncResult =
  | { ok: true; checked: number; placed: number }
  | { ok: false; error: string };

/**
 * Fills `customer_origin.country_iso` from each client's phone country
 * indicator. Stored rather than derived per request because the admin rollup
 * has to count the whole book — deriving it from the phones of whichever page
 * was on screen is what made the country card disagree with its own total.
 *
 * `onlyMissing` is the cron's mode: it touches just the rows a previous pass
 * never reached, which is a handful per run. The full rebuild passes false.
 *
 * A null result is a real answer (no phone on file, or a number libphonenumber
 * can't place) and is written as null, so a later pass doesn't retry it forever.
 */
export async function runCountrySync(onlyMissing = false): Promise<CountrySyncResult> {
  if (!isShopifyConfigured()) {
    return { ok: false, error: "Shopify isn't connected yet." };
  }
  const supabase = createServiceClient();

  // PostgREST caps a plain select at 1,000 rows. Without paging, the first run
  // silently processed ~1,000 of 5,960 clients and left the rest looking like
  // they had no phone — 16.7% placed instead of the ~72% the data supports.
  const PAGE = 1000;
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("customer_origin")
      .select("shopify_customer_id")
      .range(from, from + PAGE - 1);
    if (onlyMissing) q = q.is("country_iso", null);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    const batch = data ?? [];
    ids.push(...batch.map((r) => r.shopify_customer_id));
    if (batch.length < PAGE) break;
  }

  // Group by outcome instead of updating per client: ~30 countries plus the
  // unknown bucket means ~30 statements rather than one per row.
  const byCountry = new Map<string, string[]>();
  const UNKNOWN = "";

  // fetchCustomersDetails caps at 250 ids per call — ~24 calls for the full book.
  for (let i = 0; i < ids.length; i += 250) {
    const chunk = ids.slice(i, i + 250);
    let details: Map<string, ShopifyCustomer>;
    try {
      details = await fetchCustomersDetails(chunk);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Shopify error." };
    }
    for (const id of chunk) {
      const iso = countryFromPhone(details.get(id)?.phone)?.iso ?? UNKNOWN;
      const list = byCountry.get(iso) ?? [];
      list.push(id);
      byCountry.set(iso, list);
    }
  }

  let checked = 0;
  let placed = 0;
  for (const [iso, list] of byCountry) {
    for (let i = 0; i < list.length; i += 500) {
      const slice = list.slice(i, i + 500);
      const { error: updateError } = await supabase
        .from("customer_origin")
        .update({ country_iso: iso === UNKNOWN ? null : iso })
        .in("shopify_customer_id", slice);
      if (updateError) return { ok: false, error: updateError.message };
      checked += slice.length;
      if (iso !== UNKNOWN) placed += slice.length;
    }
  }

  return { ok: true, checked, placed };
}
