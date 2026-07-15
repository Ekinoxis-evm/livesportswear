/**
 * Pure break-time math. No DB, no time — `now` is always a parameter.
 * Break minutes are tracked only: worked hours stay checkout − checkin;
 * the 30-minute daily budget is flagged, never enforced.
 */

export type BreakRow = {
  startedAt: string; // ISO
  endedAt: string | null; // null = ongoing
};

export const BREAK_BUDGET_MINUTES = 30;

export function openBreak(rows: BreakRow[]): BreakRow | null {
  return rows.find((r) => r.endedAt === null) ?? null;
}

/** Total whole minutes on break today; an open break is clocked to `now`. */
export function breakMinutes(rows: BreakRow[], nowIso: string): number {
  const now = new Date(nowIso).getTime();
  let ms = 0;
  for (const r of rows) {
    const start = new Date(r.startedAt).getTime();
    const end = r.endedAt ? new Date(r.endedAt).getTime() : now;
    ms += Math.max(0, end - start);
  }
  return Math.round(ms / 60000);
}

export function overBreakBudget(totalMinutes: number): boolean {
  return totalMinutes > BREAK_BUDGET_MINUTES;
}
