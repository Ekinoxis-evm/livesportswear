import type { StatShift } from "@/lib/scheduling/stats";
import { addDays } from "@/lib/scheduling/week";

/**
 * How many WORKABLE days an employee has left in the month, from `today` to
 * `monthEnd` inclusive. Uses the actual PUBLISHED schedule where it exists
 * (distinct scheduled shift-dates in range) and a 5-of-7 estimate
 * (`round(uncoveredDays × maxDaysPerWeek / 7)`) for the tail after the last
 * published shift — so a rep whose future weeks aren't scheduled yet still gets
 * a sensible pace. Never exceeds the calendar days left.
 *
 * Pure. `today` / `monthEnd` are "YYYY-MM-DD"; only this employee's shifts count.
 */
export function remainingWorkdays(
  shifts: StatShift[],
  employeeId: string,
  today: string,
  monthEnd: string,
  maxDaysPerWeek: number,
): number {
  if (today > monthEnd) return 0;

  const inRange = shifts.filter(
    (s) => s.employee_id === employeeId && s.date >= today && s.date <= monthEnd,
  );
  const scheduled = new Set(inRange.map((s) => s.date)).size;

  // Estimate only the tail after the last published shift (or the whole range
  // when nothing is scheduled), so actual and estimate never overlap.
  const lastPublished = inRange.reduce((max, s) => (s.date > max ? s.date : max), "");
  const tailStart = lastPublished ? addDays(lastPublished, 1) : today;
  const uncovered = tailStart > monthEnd ? 0 : daysInclusive(tailStart, monthEnd);
  const ratio = Math.max(0, Math.min(7, maxDaysPerWeek)) / 7;
  const estimate = Math.round(uncovered * ratio);

  return Math.min(daysInclusive(today, monthEnd), scheduled + estimate);
}

function daysInclusive(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.floor((b - a) / 86_400_000) + 1;
}
