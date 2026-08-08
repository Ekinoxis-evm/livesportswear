/**
 * When a recurring kiosk reminder is due.
 *
 * The schedule is a RULE (start + every N minutes + end), not a list of times,
 * so the slots are derived rather than stored. Both functions are pure — no
 * clock, no DB — because "is it time to spray the perfume?" is exactly the kind
 * of thing that must be testable without waiting until 4pm.
 */

/** A generated slot, "HH:mm" in the store's own timezone. */
export type Slot = string;

const MIN_INTERVAL = 15;
// A guard, not a limit anyone should reach: 15-minute slots over 24h is 96.
const MAX_SLOTS = 96;

const pad = (n: number) => String(n).padStart(2, "0");

/** "HH:mm" or "HH:mm:ss" → minutes since midnight; null if unparseable. */
export function toMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export const toHHmm = (minutes: number): Slot =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/**
 * Every slot the schedule fires at, first to last.
 *
 * Steps from `start` while the slot is `<= end`, so the end is a BOUND and not
 * necessarily a slot: 10:00 every 3h to 21:00 gives 10 · 13 · 16 · 19, because
 * the next step (22:00) is past the end. That surprises people, which is why
 * the admin form previews this list rather than describing the rule.
 */
export function reminderTimes(config: {
  startTime: string;
  endTime: string;
  intervalMinutes: number;
}): Slot[] {
  const start = toMinutes(config.startTime);
  const end = toMinutes(config.endTime);
  const step = Math.floor(config.intervalMinutes);
  if (start === null || end === null) return [];
  if (!Number.isFinite(step) || step < MIN_INTERVAL) return [];
  if (end < start) return [];

  const out: Slot[] = [];
  for (let m = start; m <= end && out.length < MAX_SLOTS; m += step) {
    out.push(toHHmm(m));
  }
  return out;
}

/**
 * The slot to nag about right now, or null.
 *
 * Deliberately the LATEST slot that has come due and isn't done — never a
 * backlog. An iPad that slept through the afternoon, or a store that opened
 * late, must not greet the floor with four popups to tap through; the older
 * misses are history, and the acks table records what was actually cleared.
 */
export function dueSlot(
  times: Slot[],
  nowHHmm: string,
  acked: Iterable<string> = [],
): Slot | null {
  const now = toMinutes(nowHHmm);
  if (now === null) return null;
  const done = new Set(acked);

  let due: Slot | null = null;
  for (const slot of times) {
    const at = toMinutes(slot);
    if (at === null || at > now) break;
    due = slot;
  }
  return due !== null && !done.has(due) ? due : null;
}
