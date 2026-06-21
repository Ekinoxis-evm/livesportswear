"use server";

import * as React from "react";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdmin } from "@/lib/auth";
import { isValidDateStr } from "@/lib/scheduling/week";
import { sendSafe } from "@/lib/resend";
import { TimeOffDecisionEmail } from "@/lib/emails/time-off-decision";
import {
  type ActionResult,
  emptyToNull,
  firstError,
  dbError,
} from "@/server/shared";

const uuid = z.string().uuid();

const submitSchema = z
  .object({
    token: z.string().min(1),
    start_date: z.string().refine(isValidDateStr, "Invalid start date."),
    end_date: z.string().refine(isValidDateStr, "Invalid end date."),
    reason: z.preprocess(emptyToNull, z.string().max(500).nullable()),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: "End date can't be before the start date.",
    path: ["end_date"],
  });

/**
 * Public submission from the employee's magic-token page. No admin session —
 * the token is verified, then the write goes through the service client.
 */
export async function submitTimeOff(input: unknown): Promise<ActionResult> {
  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const service = createServiceClient();
  const { data: emp } = await service
    .from("employees")
    .select("id")
    .eq("magic_token", parsed.data.token)
    .maybeSingle();
  if (!emp) return { ok: false, error: "This link is no longer valid." };

  const { error } = await service.from("time_off_requests").insert({
    employee_id: emp.id,
    start_date: parsed.data.start_date,
    end_date: parsed.data.end_date,
    reason: parsed.data.reason,
    status: "pending",
  });
  if (error) return { ok: false, error: dbError(error) };

  revalidatePath(`/s/${parsed.data.token}`);
  return { ok: true };
}

const decisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  note: z.preprocess(emptyToNull, z.string().max(500).nullable()),
});

export async function decideTimeOff(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!uuid.safeParse(id).success) {
    return { ok: false, error: "Invalid request id." };
  }
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createServerClient();
  const upd = await supabase
    .from("time_off_requests")
    .update({
      status: parsed.data.status,
      decided_at: new Date().toISOString(),
      decided_by: admin.id,
      decided_note: parsed.data.note,
    })
    .eq("id", id)
    .select("employee_id, start_date, end_date")
    .single();
  if (upd.error) return { ok: false, error: dbError(upd.error) };

  const { data: emp } = await supabase
    .from("employees")
    .select("name, email, magic_token")
    .eq("id", upd.data.employee_id)
    .single();

  if (emp) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    await sendSafe({
      to: emp.email,
      subject: `Your time-off request was ${parsed.data.status}`,
      react: React.createElement(TimeOffDecisionEmail, {
        employeeName: emp.name,
        status: parsed.data.status,
        startDate: upd.data.start_date,
        endDate: upd.data.end_date,
        note: parsed.data.note ?? undefined,
        scheduleUrl: `${appUrl}/s/${emp.magic_token}`,
      }),
    });
  }

  revalidatePath("/admin/time-off");
  return { ok: true };
}
