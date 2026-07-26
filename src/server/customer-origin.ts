"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  runAttributionSync,
  runCountrySync,
  runCustomerStatsSync,
} from "@/lib/customer-origin-sync";
import type { ActionResult } from "@/server/shared";

/**
 * Rebuild client attribution from the full Shopify order history, then refresh
 * every client's country. Sweeps every order (~39 pages) plus ~24 customer
 * calls, so it's a deliberate admin action rather than something that runs on a
 * page load — the 10-minute cron keeps both current afterwards.
 */
export async function rebuildClientAttribution(): Promise<
  ActionResult<{ customers: number; unmappedStaff: string[]; placed: number }>
> {
  await requireAdmin();
  const result = await runAttributionSync();
  if (!result.ok) return { ok: false, error: result.error };

  // Countries are refreshed for every row, not just the new ones: a client who
  // added a phone since the last pass should stop counting as unknown.
  const countries = await runCountrySync(false);
  if (!countries.ok) return { ok: false, error: countries.error };

  // Cache each client's Shopify stats (name/orders/spend) so the list sorts by
  // them — a full refresh of every customer seen in the sweep.
  const stats = await runCustomerStatsSync(result.customerIds);
  if (!stats.ok) return { ok: false, error: stats.error };

  revalidatePath("/admin/clients");
  return {
    ok: true,
    data: {
      customers: result.customers,
      unmappedStaff: result.unmappedStaff,
      placed: countries.placed,
    },
  };
}
