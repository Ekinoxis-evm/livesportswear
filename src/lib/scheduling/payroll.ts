/**
 * Pay-period (sprint) math. A sprint is two Mon–Sun weeks (14 days). Payday is
 * the Friday after a sprint's last Sunday. Pure functions over YYYY-MM-DD; no DB.
 * The anchor is the Monday that starts sprint 1.
 */
import { addDays, weekStart } from "@/lib/scheduling/week";

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** The Monday that starts the 2-week sprint containing `date`. */
export function sprintStart(anchorMonday: string, date: string): string {
  const week = weekStart(date);
  const weeksFromAnchor = (dayNumber(week) - dayNumber(anchorMonday)) / 7;
  const sprintIndex = Math.floor(weeksFromAnchor / 2);
  return addDays(anchorMonday, sprintIndex * 14);
}

/** The Sunday that ends the sprint containing `date`. */
export function sprintEnd(anchorMonday: string, date: string): string {
  return addDays(sprintStart(anchorMonday, date), 13);
}

export function sprintRange(
  anchorMonday: string,
  date: string,
): { start: string; end: string } {
  const start = sprintStart(anchorMonday, date);
  return { start, end: addDays(start, 13) };
}

/** Payday for the sprint containing `date`: the Friday after the sprint's Sunday. */
export function payday(anchorMonday: string, date: string): string {
  return addDays(sprintEnd(anchorMonday, date), 5);
}

/**
 * Time-off submission cutoff for the week containing `date`: the Friday before
 * that week starts (schedules drop Sat/Sun). = that week's Monday minus 3 days.
 */
export function submissionCutoff(date: string): string {
  return addDays(weekStart(date), -3);
}

/** A request is late if it was submitted after its week's Friday cutoff. */
export function isLateSubmission(
  requestStartDate: string,
  submittedAtISO: string,
): boolean {
  return submittedAtISO.slice(0, 10) > submissionCutoff(requestStartDate);
}
