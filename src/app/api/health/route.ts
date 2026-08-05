import { createClient } from "@supabase/supabase-js";

/**
 * Liveness probe for uptime monitoring.
 *
 * It exists because on 2026-08-03 the Supabase project paused and the store was
 * down for ~12h before anyone noticed: `/login` kept returning 200 from the CDN
 * the whole time, so any probe that only proves "a server answered" would have
 * reported healthy throughout. This one is only green when Postgres itself
 * answers.
 *
 * 200 = database reachable. 503 = it is not — which is what an uptime checker
 * should alert on. Never cached, and excluded from the proxy matcher
 * (`src/proxy.ts`) so it reports on the database instead of dying inside the
 * middleware's own `auth.getUser()` call, which is what actually failed during
 * that outage.
 */
export const dynamic = "force-dynamic";

// Short enough that a monitor gets a decisive answer rather than its own
// timeout: a hung database should read as down, not as "no response".
const TIMEOUT_MS = 5_000;

export async function GET() {
  const started = Date.now();
  let ok = false;
  let reason: string | null = null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false },
        global: {
          fetch: (input: RequestInfo | URL, init?: RequestInit) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
        },
      },
    );
    // RLS grants anon no rows on `locations`, so this comes back empty — the
    // point is the round trip, not the data. An unreachable or unhealthy
    // database fails here instead of returning an empty list.
    const { error } = await supabase.from("locations").select("id").limit(1);
    ok = !error;
    if (error) reason = error.message.slice(0, 120);
  } catch (e) {
    reason = e instanceof Error ? e.message.slice(0, 120) : "unknown error";
  }

  return Response.json(
    {
      status: ok ? "ok" : "unavailable",
      database: ok ? "ok" : "unreachable",
      ...(reason ? { reason } : {}),
      latencyMs: Date.now() - started,
      version:
        process.env.VERCEL_DEPLOYMENT_ID ??
        process.env.VERCEL_GIT_COMMIT_SHA ??
        "dev",
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
