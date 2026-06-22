export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

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

export function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

/** "monday" -> "Mon" */
export function shortWeekday(day: Weekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1, 3);
}
