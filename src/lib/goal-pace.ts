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
  daysLeft: number; // remaining days in the month, INCLUDING today
  perDay: number; // remaining / daysLeft, 0 when reached or no days left
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
 */
export function goalPace(
  goal: number,
  sold: number,
  today: string,
  month: string,
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

  const perDay =
    reached || daysLeft <= 0 || remaining <= 0 ? 0 : round2(remaining / daysLeft);

  return { goal, sold: round2(sold), remaining, reached, pct, daysLeft, perDay };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
