/**
 * Narrow a report's recipients to a per-send selection.
 *
 * The kiosk lets the closer drop someone from ONE send without editing the
 * stored list. The intersection is the security boundary: a kiosk caller must
 * never be able to send the day's numbers to an address it invents, so anything
 * not already on the stored list is discarded rather than trusted.
 *
 * An empty or absent selection means "send to everyone", not "send to nobody" —
 * and a selection that matches nothing (a stale screen submitting addresses
 * since removed) falls back to everyone too. A report reaching no one is worse
 * than one reaching the full list.
 *
 * Pure: no DB, no network, no clock.
 */
export function narrowRecipients(stored: string[], only?: string[]): string[] {
  if (!only || only.length === 0) return stored;
  const wanted = new Set(only.map((e) => e.trim().toLowerCase()));
  const kept = stored.filter((e) => wanted.has(e.trim().toLowerCase()));
  return kept.length > 0 ? kept : stored;
}
