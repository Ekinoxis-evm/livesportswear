import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { fetchStaffSales, fetchStaffNames } from "@/lib/shopify";
import type { SalesBreakdown } from "@/lib/sales-breakdown";
import { monthRangeInTz, normalizeStaffId } from "@/lib/shopify-range";
import { primaryTimezone } from "@/lib/business-tz";

export type SyncResult =
  | { ok: true; updated: number; unmatched: number }
  | { ok: false; error: string };

/**
 * Pulls one month of sales from Shopify, attributes each POS order to its
 * staff member (order.user_id), maps that to an employee (by explicit
 * shopify_staff_id, falling back to a case-insensitive name match against the
 * order timeline's staff name), and upserts monthly_sales (source=shopify).
 * Uses the service client so it works from both an admin action and the cron.
 */
export async function runShopifySync(month: string): Promise<SyncResult> {
  if (!isShopifyConfigured()) {
    return { ok: false, error: "Shopify isn't connected yet." };
  }
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { ok: false, error: "Invalid month." };
  }

  const { start, endExclusive } = monthRangeInTz(month, await primaryTimezone());

  let totals: Map<string, SalesBreakdown>;
  let names: Map<string, string>;
  try {
    const sales = await fetchStaffSales(start, endExclusive);
    totals = sales.totals;
    names = await fetchStaffNames(sales.sampleOrder);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Shopify error." };
  }

  const supabase = createServiceClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, shopify_staff_id");

  const empByStaffId = new Map(
    (employees ?? [])
      .filter((e) => e.shopify_staff_id)
      .map((e) => [normalizeStaffId(e.shopify_staff_id as string), e.id]),
  );
  const empByName = new Map(
    (employees ?? []).map((e) => [e.name.trim().toLowerCase(), e.id]),
  );

  const resolve = (staffId: string): string | null => {
    const explicit = empByStaffId.get(staffId);
    if (explicit) return explicit;
    const name = names.get(staffId)?.trim().toLowerCase();
    return name ? (empByName.get(name) ?? null) : null;
  };

  let updated = 0;
  let unmatched = 0;
  for (const [staffId, sales] of totals) {
    const employeeId = resolve(staffId);
    if (!employeeId) {
      unmatched++;
      continue;
    }
    const { error } = await supabase
      .from("monthly_sales")
      .upsert(
        {
          employee_id: employeeId,
          month,
          amount: sales.net,
          gross_amount: sales.gross,
          discounts_amount: sales.discounts,
          returns_amount: sales.returns,
          source: "shopify",
        },
        { onConflict: "employee_id,month" },
      );
    if (!error) updated++;
  }

  return { ok: true, updated, unmatched };
}
