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

export function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

/** "monday" -> "Mon" */
export function shortWeekday(day: Weekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1, 3);
}
