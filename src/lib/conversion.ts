/**
 * Pure in-store conversion math. No DB, no time. Operates on plain event rows
 * (one per customer attended). Sales revenue is Shopify-sourced elsewhere; this
 * is purely the conversion (count) layer.
 *
 * Returns/exchanges (`kind: "return"`) are a separate counter by design: a
 * return with `sold: true` means the customer bought something else, and it
 * must never inflate or hurt the walk-in conversion rate.
 */

export type ConversionInput = {
  employee_id: string;
  sold: boolean;
  got_contact: boolean;
  kind?: "walkin" | "return" | string | null; // absent/null = walkin
  served_seconds?: number | null; // time attended (0056); null = not timed
};

export type ConversionTotals = {
  attended: number; // walk-ins only
  sold: number;
  contacts: number;
  conversion: number; // sold / attended, 0..1
  contactRate: number; // contacts / sold, 0..1
  returns: number;
  returnExtraSales: number; // returns where the customer bought more
  avgServedSeconds: number | null; // mean attend time over timed events; null if none
};

export type PersonConversion = ConversionTotals & { employeeId: string };

const isReturn = (e: ConversionInput) => e.kind === "return";

export function conversionRate(sold: number, attended: number): number {
  return attended === 0 ? 0 : sold / attended;
}

export function totals(events: ConversionInput[]): ConversionTotals {
  const walkins = events.filter((e) => !isReturn(e));
  const returnEvents = events.filter(isReturn);
  const attended = walkins.length;
  const sold = walkins.filter((e) => e.sold).length;
  const contacts = walkins.filter((e) => e.got_contact).length;
  // Averaged over every timed client (walk-ins + returns).
  const timed = events.filter((e) => e.served_seconds != null);
  return {
    attended,
    sold,
    contacts,
    conversion: conversionRate(sold, attended),
    contactRate: sold === 0 ? 0 : contacts / sold,
    returns: returnEvents.length,
    returnExtraSales: returnEvents.filter((e) => e.sold).length,
    avgServedSeconds: timed.length
      ? Math.round(timed.reduce((s, e) => s + (e.served_seconds ?? 0), 0) / timed.length)
      : null,
  };
}

/** A duration as m:ss (or h:mm:ss past an hour); em dash when unknown. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** Per-employee breakdown, ordered by sold desc then attended desc. */
export function byPerson(events: ConversionInput[]): PersonConversion[] {
  const groups = new Map<string, ConversionInput[]>();
  for (const e of events) {
    const arr = groups.get(e.employee_id) ?? [];
    arr.push(e);
    groups.set(e.employee_id, arr);
  }
  return [...groups.entries()]
    .map(([employeeId, evs]) => ({ employeeId, ...totals(evs) }))
    .sort((a, b) => b.sold - a.sold || b.attended - a.attended);
}

export function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
