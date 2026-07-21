import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { streamOrdersForAttribution } from "@/lib/shopify";
import { normalizeStaffId } from "@/lib/shopify-range";
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
