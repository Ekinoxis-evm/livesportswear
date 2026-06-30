import { formatInTimeZone } from "date-fns-tz";

/**
 * The location-local calendar date (YYYY-MM-DD) for a moment in time. Used to
 * group `client_events` / day-closes by the store's own day, not UTC.
 */
export function businessDate(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}
