/**
 * The per-client attend timer queue. Each open client a rep is attending is one
 * entry `{kind, at}` on `floor_checkins.attending_started_at`; the duration is
 * the difference between the finish time and the entry's `at`. Walk-ins and
 * returns queue independently by `kind` so finishing one kind pops the right
 * start. Pure: no DB, no network, no clock (the caller passes ISO timestamps).
 */

export type AttendKind = "walkin" | "return";
export type OpenClient = { kind: AttendKind; at: string }; // at = ISO taken-time
export type AttendQueue = OpenClient[];

/** Read a stored jsonb value back into a clean queue (tolerates null/garbage). */
export function asQueue(value: unknown): AttendQueue {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is OpenClient =>
      !!e &&
      typeof e === "object" &&
      (e as OpenClient).kind !== undefined &&
      ((e as OpenClient).kind === "walkin" || (e as OpenClient).kind === "return") &&
      typeof (e as OpenClient).at === "string",
  );
}

/** Push a newly-taken client onto the end of the queue. */
export function pushOpen(queue: AttendQueue, kind: AttendKind, at: string): AttendQueue {
  return [...queue, { kind, at }];
}

/**
 * Finish: remove the OLDEST open client of `kind` (first taken, first finished)
 * and return it plus the trimmed queue. `entry` is null when none was queued
 * (pre-timer rows) — the caller just records no duration.
 */
export function popOldest(
  queue: AttendQueue,
  kind: AttendKind,
): { entry: OpenClient | null; queue: AttendQueue } {
  const i = queue.findIndex((e) => e.kind === kind);
  if (i === -1) return { entry: null, queue };
  return { entry: queue[i], queue: [...queue.slice(0, i), ...queue.slice(i + 1)] };
}

/** Undo the last take: remove the NEWEST open client of `kind` (no duration). */
export function popNewest(queue: AttendQueue, kind: AttendKind): AttendQueue {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].kind === kind) return [...queue.slice(0, i), ...queue.slice(i + 1)];
  }
  return queue;
}

/** The earliest open `at` across all kinds — drives the live board clock. */
export function oldestAt(queue: AttendQueue): string | null {
  let min: string | null = null;
  for (const e of queue) if (min === null || e.at < min) min = e.at;
  return min;
}

/** Whole seconds between two ISO instants, clamped ≥ 0 (a clock skew can't go negative). */
export function servedSeconds(fromISO: string, toISO: string): number {
  const secs = Math.round((new Date(toISO).getTime() - new Date(fromISO).getTime()) / 1000);
  return secs > 0 ? secs : 0;
}
