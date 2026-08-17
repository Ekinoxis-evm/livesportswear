/**
 * Which day the kiosk is looking at, and where it can step next.
 *
 * The floor screen browses back through past days, so the bound matters: a
 * future date must never resolve (there is nothing there but an empty day that
 * looks like a bad one), and the walk back is capped so a mis-tap can't wander
 * into 2024. The caller re-derives this server-side, so a hand-typed `?date=`
 * is clamped rather than trusted.
 *
 * Pure: no clock (the caller passes today), no DB.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** How far back the kiosk lets the floor walk. */
export const MAX_DAYS_BACK = 30;

export type DayWindow = {
  date: string; // the day to show
  prev: string | null; // null at the oldest reachable day
  next: string | null; // null on today — never the future
  isToday: boolean;
};

/** `yyyy-MM-dd` ± n days, done on the calendar date itself (no timezone math:
 *  the caller already resolved "today" in the store's zone). */
export function shiftDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function resolveViewDay(
  raw: string | undefined,
  today: string,
  maxBack: number = MAX_DAYS_BACK,
): DayWindow {
  const oldest = shiftDay(today, -maxBack);
  let date = today;
  if (
    raw &&
    DATE_RE.test(raw) &&
    !Number.isNaN(Date.parse(`${raw}T00:00:00Z`))
  ) {
    // Clamp rather than reject: a stale link or a typo lands on the nearest
    // real day instead of a blank screen.
    date = raw > today ? today : raw < oldest ? oldest : raw;
  }
  return {
    date,
    prev: date > oldest ? shiftDay(date, -1) : null,
    next: date < today ? shiftDay(date, 1) : null,
    isToday: date === today,
  };
}
