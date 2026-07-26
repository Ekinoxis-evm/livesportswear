/**
 * How a rep is tracking against a monthly sales goal: what's left, and what they
 * must average per remaining day to reach it.
 *
 * Pure — no DB, no clock. The caller passes the store-local "today" and the
 * month it belongs to (both YYYY-MM-DD / YYYY-MM), so this stays testable and
 * timezone-correct (today comes from businessDate(tz)).
 */

export type GoalPace = {
  goal: number;
  sold: number;
  remaining: number; // max(0, goal - sold)
  reached: boolean;
  pct: number; // sold / goal, 0..1 (0 when goal is 0)
  daysLeft: number; // CALENDAR days remaining in the month, INCLUDING today
  paceDays: number; // the divisor for perDay: workdays if given, else daysLeft
  workBasis: boolean; // true when paceDays came from workDaysLeft (a person)
  perDay: number; // remaining / paceDays, 0 when reached or no days left
};

/** Days in a calendar month. `month` is "YYYY-MM". */
function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day
}

/**
 * @param goal   the rep's monthly target (0 = no goal set)
 * @param sold   net sales so far this month
 * @param today  store-local date "YYYY-MM-DD"
 * @param month  the month "YYYY-MM" the goal/sales belong to
 * @param workDaysLeft  for a PERSON: their remaining WORKABLE days (they work
 *   ~5 of 7), so per-day is spread over shifts they'll actually work — not flat
 *   calendar days. Omit for the store, which sells every day.
 */
export function goalPace(
  goal: number,
  sold: number,
  today: string,
  month: string,
  workDaysLeft?: number,
): GoalPace {
  const remaining = Math.max(0, round2(goal - sold));
  const reached = goal > 0 && sold >= goal;
  const pct = goal > 0 ? sold / goal : 0;

  // Days left including today. If `today` is in a different (later) month, the
  // month is over → 0 days left. Earlier month → the whole month remains.
  const todayMonth = today.slice(0, 7);
  let daysLeft: number;
  if (todayMonth === month) {
    const dom = Number(today.slice(8, 10));
    daysLeft = daysInMonth(month) - dom + 1;
  } else if (todayMonth < month) {
    daysLeft = daysInMonth(month);
  } else {
    daysLeft = 0;
  }

  // A person paces over their workable days; the store over calendar days.
  const workBasis = workDaysLeft != null;
  const paceDays = workBasis ? Math.max(0, Math.round(workDaysLeft)) : daysLeft;
  const perDay =
    reached || paceDays <= 0 || remaining <= 0 ? 0 : round2(remaining / paceDays);

  return {
    goal,
    sold: round2(sold),
    remaining,
    reached,
    pct,
    daysLeft,
    paceDays,
    workBasis,
    perDay,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
