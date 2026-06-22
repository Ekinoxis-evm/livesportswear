import "server-only";
import { z } from "zod";

/**
 * Validates the environment at boot (see src/instrumentation.ts). Only the keys
 * that, if missing, leave the app broken are required; optional keys (Resend,
 * payroll overrides) are validated where used. Fail fast with a clear message.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Invalid or missing environment variables: ${keys}`);
}

export const env = parsed.data;
