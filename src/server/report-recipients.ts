"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin, accessibleLocationIds } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { type ActionResult, dbError } from "@/server/shared";
import {
  managedReportEmails,
  sendTestReportFor,
  sendReportForDate,
  reportDraftFor,
  type CloseDayDraft,
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
const testSendSchema = locationSchema.extend({
  recipients: z.array(z.string()).optional(),
  // Generous bound at the boundary; `cleanNote` does the real trimming + cap.
  note: z.string().max(4000).optional(),
});

export async function sendTestReport(
  input: unknown,
): Promise<ActionResult<{ sentTo: number }>> {
  await requireAdmin();
  const parsed = testSendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (!(await canAccess(parsed.data.location_id)))
    return { ok: false, error: "You can't manage that location." };

  // `recipients` is a per-send narrowing, intersected server-side against the
  // stored list by sendTestReportFor — never a free-text destination.
  return sendTestReportFor(
    parsed.data.location_id,
    parsed.data.recipients,
    undefined,
    parsed.data.note,
  );
}

/**
 * Re-send one day's report — the admin side of the recovery path. Unlike
 * closing, this needs no on-floor closer: it re-derives the day and mails the
 * stored recipient list.
 */
const resendSchema = locationSchema.extend({
  business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date."),
});

export async function resendReport(
  input: unknown,
): Promise<ActionResult<{ sentTo: number }>> {
  await requireAdmin();
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (!(await canAccess(parsed.data.location_id)))
    return { ok: false, error: "You can't manage that location." };

  const res = await sendReportForDate(
    parsed.data.location_id,
    parsed.data.business_date,
  );
  if (res.ok) revalidatePath("/admin/performance/daily");
  return res;
}

/**
 * The report a test send would produce — metrics, subject, recipients — so the
 * wizard can show it before sending. Read-only; writes nothing.
 */
export async function reportDraft(input: unknown): Promise<ActionResult<CloseDayDraft>> {
  await requireAdmin();
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  if (!(await canAccess(parsed.data.location_id)))
    return { ok: false, error: "You can't manage that location." };

  return reportDraftFor(parsed.data.location_id);
}
