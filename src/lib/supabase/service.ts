import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role client that BYPASSES RLS. Use only in:
 *   - public token-verified routes (after the magic token is checked)
 *   - cron handlers (after CRON_SECRET is verified)
 *   - admin server actions that need cross-tenant access
 * Never import this from a Client Component.
 */
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
