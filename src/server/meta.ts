"use server";

import { requireAdmin } from "@/lib/auth";
import { runMetaSyncForMonth, type MetaSyncResult } from "@/lib/meta-sync";

export async function syncAdInsights(month?: string): Promise<MetaSyncResult> {
  await requireAdmin();
  const m = month ?? new Date().toISOString().slice(0, 7);
  return runMetaSyncForMonth(m);
}
