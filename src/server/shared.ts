import { z } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Treat blank strings and missing values (undefined/null) as SQL NULL. */
export const emptyToNull = (v: unknown) =>
  v == null || (typeof v === "string" && v.trim() === "") ? null : v;

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

/** Maps a Postgres error to a user-facing message; `byCode` overrides per SQLSTATE. */
export function dbError(
  error: { code?: string; message: string },
  byCode?: Record<string, string>,
): string {
  if (error.code && byCode?.[error.code]) return byCode[error.code];
  if (error.code === "23505") return "That value is already in use.";
  return error.message;
}
