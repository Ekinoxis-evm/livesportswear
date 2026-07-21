/**
 * Human date labels. The year is noise for in-year dates, so it only appears
 * when the date falls outside the current year.
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

const MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const currentYear = () => new Date().getFullYear();

/** "2026-07-07" -> "Jul 7" (or "Jul 7, 2025" outside the current year). */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const base = `${MONTHS[m - 1]} ${d}`;
  return y === currentYear() ? base : `${base}, ${y}`;
}

/** "2024-02-17" -> "Feb 17, 2024" — always with the year. For history that
 * spans years, where dropping it makes two rows look like the same day. */
export function fullDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "2026-06-22".."2026-07-05" -> "Jun 22 – Jul 5" (year only if not current). */
export function shortDateRange(start: string, end: string): string {
  if (start === end) return shortDate(start);
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** "2026-07" -> "July" (or "July 2025" outside the current year). */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const base = MONTHS_FULL[m - 1];
  return y === currentYear() ? base : `${base} ${y}`;
}
