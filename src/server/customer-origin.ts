"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { runAttributionSync } from "@/lib/customer-origin-sync";
import type { ActionResult } from "@/server/shared";

/**
 * Rebuild client attribution from the full Shopify order history. Sweeps every
 * order (~39 pages), so it's a deliberate admin action rather than something
 * that runs on a page load — the 10-minute cron keeps it current afterwards.
 */
export async function rebuildClientAttribution(): Promise<
  ActionResult<{ customers: number; unmappedStaff: string[] }>
> {
  await requireAdmin();
  const result = await runAttributionSync();
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/clients");
  return {
    ok: true,
    data: { customers: result.customers, unmappedStaff: result.unmappedStaff },
  };
}
