import { isoWeekday } from "@/lib/scheduling/week";

/** 3-letter labels indexed by ISO weekday - 1 (Mon=0 … Sun=6). */
export const SHORT_WEEKDAYS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

const FULL_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** "2026-07-07" -> "Tuesday" */
export function weekdayName(date: string): string {
  return FULL_WEEKDAYS[isoWeekday(date) - 1];
}
