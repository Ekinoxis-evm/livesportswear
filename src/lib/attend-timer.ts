/**
 * The per-client attend timer queue. Each open client a rep is attending is one
 * entry `{id, kind, at}` on `floor_checkins.attending_started_at`; the duration is
 * the difference between the finish time and the entry's `at`. Walk-ins and
 * returns queue independently by `kind` so finishing one kind pops the right
 * start. Pure: no DB, no network, no clock (the caller passes ISO timestamps).
 */

export type AttendKind = "walkin" | "return";
/** `at` = ISO taken-time; `id` names THIS client so a finish can say which one. */
export type OpenClient = { id: string; kind: AttendKind; at: string };
export type AttendQueue = OpenClient[];

/**
 * Read a stored jsonb value back into a clean queue (tolerates null/garbage).
 *
 * Entries written before ids existed carry none, so one is derived from the two
 * fields they do have. It must be DETERMINISTIC: the board hands these ids to
 * the browser and the finish sends one back, so a fresh read has to produce the
 * same id or the pop would miss. (Only ever relevant to clients already open at
 * deploy time — the queue empties as the floor closes them.)
 */
export function asQueue(value: unknown): AttendQueue {
  if (!Array.isArray(value)) return [];
  const out: AttendQueue = [];
  for (const e of value) {
    if (!e || typeof e !== "object") continue;
    const { id, kind, at } = e as Partial<OpenClient>;
    if (kind !== "walkin" && kind !== "return") continue;
    if (typeof at !== "string") continue;
    out.push({ id: typeof id === "string" && id ? id : `${kind}-${at}`, kind, at });
  }
  return out;
}

/**
 * Push a newly-taken client onto the end of the queue. The caller supplies the
 * id (this stays pure — no randomness in here).
 */
export function pushOpen(
  queue: AttendQueue,
  kind: AttendKind,
  at: string,
  id: string,
): AttendQueue {
  return [...queue, { id, kind, at }];
}

/**
 * Finish a SPECIFIC open client. `entry` is null when the id isn't in the queue
 * (a stale screen, or a client already closed from another tap) — the caller
 * falls back to `popOldest` rather than refusing, so a finish is never lost.
 */
export function popById(
  queue: AttendQueue,
  id: string,
): { entry: OpenClient | null; queue: AttendQueue } {
  const i = queue.findIndex((e) => e.id === id);
  if (i === -1) return { entry: null, queue };
  return { entry: queue[i], queue: [...queue.slice(0, i), ...queue.slice(i + 1)] };
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
