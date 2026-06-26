"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { listStaffMembers, type ShopifyStaff } from "@/lib/shopify";
import { runShopifySync, type SyncResult } from "@/lib/shopify-sync";
import { type ActionResult, dbError } from "@/server/shared";

const uuid = z.string().uuid();

export async function syncMonthlySales(month?: string): Promise<SyncResult> {
  await requireAdmin();
  const m = month ?? new Date().toISOString().slice(0, 10).slice(0, 7);
  return runShopifySync(m);
}

export async function listShopifyStaff(): Promise<
  ActionResult<{ staff: ShopifyStaff[] }>
> {
  await requireAdmin();
  if (!isShopifyConfigured()) {
    return { ok: false, error: "Shopify isn't connected yet." };
  }
  try {
    return { ok: true, data: { staff: await listStaffMembers() } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Shopify error." };
  }
}

export async function setShopifyStaffId(
  employeeId: string,
  staffId: string | null,
): Promise<ActionResult> {
  await requireAdmin();
  if (!uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid employee." };
  }
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("employees")
    .update({ shopify_staff_id: staffId || null })
    .eq("id", employeeId);
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/settings");
  return { ok: true };
}
