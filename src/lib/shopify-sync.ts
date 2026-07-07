import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { listStaffMembers, fetchSalesByStaff } from "@/lib/shopify";
import { monthRangeInTz } from "@/lib/shopify-range";
import { primaryTimezone } from "@/lib/business-tz";

export type SyncResult =
  | { ok: true; updated: number; unmatched: number }
  | { ok: false; error: string };

/**
 * Pulls one month of sales from Shopify, attributes each order to a Shopify
 * staff member (POS), maps that to an employee (by explicit shopify_staff_id,
 * falling back to matching email), and upserts monthly_sales (source=shopify).
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

  let salesByStaff: Map<string, number>;
  let staff: { id: string; email: string | null }[];
  try {
    [salesByStaff, staff] = await Promise.all([
      fetchSalesByStaff(start, endExclusive),
      listStaffMembers(),
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Shopify error." };
  }

  const supabase = createServiceClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, email, shopify_staff_id");

  const empByStaffId = new Map(
    (employees ?? [])
      .filter((e) => e.shopify_staff_id)
      .map((e) => [e.shopify_staff_id as string, e.id]),
  );
  const empByEmail = new Map(
    (employees ?? []).map((e) => [e.email.toLowerCase(), e.id]),
  );
  const staffEmail = new Map(staff.map((s) => [s.id, s.email?.toLowerCase()]));

  const resolve = (staffId: string): string | null => {
    const explicit = empByStaffId.get(staffId);
    if (explicit) return explicit;
    const email = staffEmail.get(staffId);
    return email ? (empByEmail.get(email) ?? null) : null;
  };

  let updated = 0;
  let unmatched = 0;
  for (const [staffId, amount] of salesByStaff) {
    const employeeId = resolve(staffId);
    if (!employeeId) {
      unmatched++;
      continue;
    }
    const { error } = await supabase
      .from("monthly_sales")
      .upsert(
        { employee_id: employeeId, month, amount, source: "shopify" },
        { onConflict: "employee_id,month" },
      );
    if (!error) updated++;
  }

  return { ok: true, updated, unmatched };
}
