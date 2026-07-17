import "server-only";
import * as React from "react";
import { Resend } from "resend";

export type EmailAttachment = { filename: string; content: string };

export type SendArgs = {
  to: string;
  subject: string;
  react: React.ReactElement;
  attachments?: EmailAttachment[];
};

export type SendResult = { ok: true; id?: string } | { ok: false; error: string };

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const first = local[0] ?? "";
  return `${first}***${domain}`;
}

export async function sendSafe(args: SendArgs): Promise<SendResult> {
  const { to, subject, react, attachments } = args;
  const from = process.env.SENDER_EMAIL_ADDRESS;
  const replyTo = process.env.REPLY_TO_EMAIL_ADDRESSES;

  if (process.env.RESEND_DRY_RUN === "true") {
    console.log(`[email:dry-run] to=${maskEmail(to)} subject="${subject}"`);
    return { ok: true };
  }

  if (!from) {
    console.error("[email] SENDER_EMAIL_ADDRESS is not configured");
    return { ok: false, error: "SENDER_EMAIL_ADDRESS is not configured" };
  }
  if (!process.env.RESEND_API_KEY) {
    console.error("[email] RESEND_API_KEY is not configured");
    return { ok: false, error: "RESEND_API_KEY is not configured" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    react,
    attachments,
    replyTo,
  });

  if (error) {
    // Surface the reason (masked recipient) so delivery issues are debuggable.
    console.error(
      `[email] send failed to=${maskEmail(to)} from=${from} subject="${subject}": ${error.message}`,
    );
    return { ok: false, error: error.message };
  }

  console.log(`[email] sent id=${data?.id ?? "?"} to=${maskEmail(to)} from=${from}`);
  return { ok: true, id: data?.id };
}
