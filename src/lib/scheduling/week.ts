/**
 * Week math, Monday-anchored. Pure functions over `YYYY-MM-DD` date strings.
 * Everything is computed in UTC so a calendar date never shifts under the
 * machine's local timezone. No DB calls. See .claude/rules/testing.md.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toUTCDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True if `s` is a real calendar date in `YYYY-MM-DD` form. */
export function isValidDateStr(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  return fmt(toUTCDate(s)) === s;
}

export function addDays(dateStr: string, n: number): string {
  const d = toUTCDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
}

/** 1 = Monday … 7 = Sunday (ISO weekday). */
export function isoWeekday(dateStr: string): number {
  return ((toUTCDate(dateStr).getUTCDay() + 6) % 7) + 1;
}

export function isMonday(dateStr: string): boolean {
  return isoWeekday(dateStr) === 1;
}

/** The Monday on or before `dateStr`. */
export function weekStart(dateStr: string): string {
  return addDays(dateStr, -(isoWeekday(dateStr) - 1));
}

/** The seven dates Mon→Sun for the week containing (or starting at) the input. */
export function weekDays(dateStr: string): string[] {
  const start = weekStart(dateStr);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Monday of the week containing `now` (defaults to the real current time). */
export function currentWeekStart(now: Date = new Date()): string {
  return weekStart(fmt(now));
}

/** Returns the Monday for a user-supplied week param, or `fallback` if invalid. */
export function normalizeWeekStart(
  param: string | undefined | null,
  fallback: string,
): string {
  if (param && isValidDateStr(param)) return weekStart(param);
  return fallback;
}

/** "May 26 – Jun 1" for the week starting at `weekStartStr`. */
export function formatWeekRange(weekStartStr: string): string {
  const start = toUTCDate(weekStartStr);
  const end = toUTCDate(addDays(weekStartStr, 6));
  const left = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const right = `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${left} – ${right}`;
}
