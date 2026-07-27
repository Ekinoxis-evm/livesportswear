import "server-only";

/**
 * Best-effort, per-instance cooldown for manual "refresh" actions so a burst of
 * taps can't hammer Shopify. Keyed by a string; returns 0 when the action may
 * run (and stamps the clock), else the whole seconds left to wait. Per serverless
 * instance, so it's a guard, not a hard guarantee — the underlying syncs are
 * idempotent, so an occasional extra run across instances is harmless.
 */
const lastRun = new Map<string, number>();

export function cooldown(key: string, ms: number): number {
  const now = Date.now();
  const remaining = (lastRun.get(key) ?? 0) + ms - now;
  if (remaining > 0) return Math.ceil(remaining / 1000);
  lastRun.set(key, now);
  return 0;
}
