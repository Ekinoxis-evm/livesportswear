const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const MAX_SPAN_DAYS = 366;

/**
 * Resolve ?from/?to params into a safe inclusive range: valid dates, ordered,
 * span capped (long ranges paginate every Shopify order in between). Defaults
 * to month-to-date of the given business date.
 */
export function resolveDateRange(
  sp: { from?: string; to?: string },
  today: string,
): { from: string; to: string } {
  let from = sp.from && DATE_RE.test(sp.from) ? sp.from : `${today.slice(0, 7)}-01`;
  let to = sp.to && DATE_RE.test(sp.to) ? sp.to : today;
  if (from > to) [from, to] = [to, from];
  if (spanDays(from, to) > MAX_SPAN_DAYS) {
    const d = new Date(`${to}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (MAX_SPAN_DAYS - 1));
    from = d.toISOString().slice(0, 10);
  }
  return { from, to };
}

export function spanDays(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}
