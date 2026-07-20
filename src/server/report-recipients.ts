"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin, accessibleLocationIds } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { type ActionResult, dbError } from "@/server/shared";
import {
  managedReportEmails,
  buildDayReportData,
  sendDayReport,
} from "@/server/conversion-core";

/** The current admin must be able to manage this location. */
async function canAccess(locationId: string): Promise<boolean> {
  const access = await accessibleLocationIds();
  return access === "all" || access.includes(locationId);
}

const locationSchema = z.object({ location_id: z.string().uuid() });
const recipientSchema = locationSchema.extend({
  email: z.string().trim().toLowerCase().email(),
});

/** The editable recipient list for a location's daily report. */
export async function listReportRecipients(
  input: unknown,
): Promise<ActionResult<{ recipients: string[] }>> {
  await requireAdmin();
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (!(await canAccess(parsed.data.location_id)))
    return { ok: false, error: "You can't manage that location." };

  const recipients = await managedReportEmails(parsed.data.location_id);
  return { ok: true, data: { recipients } };
}

/** Add a report recipient (owner, accountant, …) for a location. */
export async function addReportRecipient(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = recipientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  const { location_id, email } = parsed.data;
  if (!(await canAccess(location_id)))
    return { ok: false, error: "You can't manage that location." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("store_report_recipients")
    .insert({ location_id, email, created_by: admin.id });
  if (error)
    return {
      ok: false,
      error: dbError(error, { "23505": "That email is already a recipient." }),
    };

  revalidatePath("/admin/performance/daily");
  return { ok: true };
}

/** Remove a managed report recipient (admin auth emails can't be removed here). */
export async function removeReportRecipient(input: unknown): Promise<ActionResult> {
  await requireAdmin();
  const parsed = recipientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { location_id, email } = parsed.data;
  if (!(await canAccess(location_id)))
    return { ok: false, error: "You can't manage that location." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("store_report_recipients")
    .delete()
    .eq("location_id", location_id)
    .ilike("email", email);
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath("/admin/performance/daily");
  return { ok: true };
}

/**
 * Send today's report to the current recipients WITHOUT closing the day — the
 * subject is prefixed [TEST] and no store_day_closes row is written.
 */
export async function sendTestReport(
  input: unknown,
): Promise<ActionResult<{ sentTo: number }>> {
  await requireAdmin();
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (!(await canAccess(parsed.data.location_id)))
    return { ok: false, error: "You can't manage that location." };

  const d = await buildDayReportData(parsed.data.location_id);
  if (d.recipients.length === 0)
    return { ok: false, error: "No recipients configured — add an email first." };

  const { sent, failed, firstError } = await sendDayReport(d, "Test", { test: true });
  // Surface a real delivery failure instead of a misleading "sent" — most
  // often an unverified sender domain in Resend (SENDER_EMAIL_ADDRESS).
  if (sent === 0) {
    return { ok: false, error: firstError ?? "The report could not be sent." };
  }
  if (failed > 0) {
    return { ok: false, error: `Sent to ${sent}, but ${failed} failed: ${firstError ?? "unknown error"}` };
  }
  return { ok: true, data: { sentTo: sent } };
}
