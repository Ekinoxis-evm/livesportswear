/**
 * The final recipient list for one send.
 *
 * The wizard's first step starts from the stored default list and lets the
 * closer drop or add addresses for THIS send only (the stored list is never
 * edited here). This resolves that selection safely.
 *
 * Removals apply against the stored list. Additions are allowed but must be
 * valid email addresses — the kiosk can already add permanent recipients from
 * the same screen, so a one-off add is no new capability, and a garbage string
 * must never reach the mail API. An empty selection means "everyone on the
 * stored list", and a selection that resolves to nothing falls back to the
 * stored list: a report reaching no one is worse than one reaching everyone.
 *
 * Pure: no DB, no network, no clock.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (e: string) => e.trim().toLowerCase();

export function resolveRecipients(stored: string[], selection?: string[]): string[] {
  if (!selection || selection.length === 0) return stored;

  const storedSet = new Set(stored.map(norm));
  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of selection) {
    const email = norm(raw);
    if (!EMAIL_RE.test(email) || seen.has(email)) continue;
    // Keep an address if it's already stored (a survivor of the default list)
    // or a well-formed new one the closer typed in for this send.
    out.push(email);
    seen.add(email);
    void storedSet; // membership isn't required — validity is the guard
  }

  return out.length > 0 ? out : stored;
}
