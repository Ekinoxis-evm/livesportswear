/**
 * Pure in-store conversion math. No DB, no time. Operates on plain event rows
 * (one per customer attended). Sales revenue is Shopify-sourced elsewhere; this
 * is purely the conversion (count) layer.
 */

export type ConversionInput = {
  employee_id: string;
  sold: boolean;
  got_contact: boolean;
};

export type ConversionTotals = {
  attended: number;
  sold: number;
  contacts: number;
  conversion: number; // sold / attended, 0..1
  contactRate: number; // contacts / sold, 0..1
};

export type PersonConversion = ConversionTotals & { employeeId: string };

export function conversionRate(sold: number, attended: number): number {
  return attended === 0 ? 0 : sold / attended;
}

export function totals(events: ConversionInput[]): ConversionTotals {
  const attended = events.length;
  const sold = events.filter((e) => e.sold).length;
  const contacts = events.filter((e) => e.got_contact).length;
  return {
    attended,
    sold,
    contacts,
    conversion: conversionRate(sold, attended),
    contactRate: sold === 0 ? 0 : contacts / sold,
  };
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
