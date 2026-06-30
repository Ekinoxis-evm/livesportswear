"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSafe } from "@/lib/resend";
import { PasswordResetEmail } from "@/lib/emails/password-reset";

const emailSchema = z.string().email();

/**
 * Public password-reset request. Generates a Supabase recovery link server-side
 * and delivers it via Resend (not Supabase SMTP). Always resolves `{ ok: true }`
 * and never reveals whether an account exists (no enumeration). Not rate-limited
 * yet — see security.md "Known v1 limitations".
 */
export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { ok: true };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const service = createServiceClient();
  const { data, error } = await service.auth.admin.generateLink({
    type: "recovery",
    email: parsed.data,
    options: { redirectTo: `${appUrl}/reset-password` },
  });
  // Most common error here is "user not found" — stay silent.
  if (error || !data.properties) return { ok: true };

  await sendSafe({
    to: parsed.data,
    subject: "Reset your Live password",
    react: PasswordResetEmail({ actionUrl: data.properties.action_link }),
  });
  return { ok: true };
}
