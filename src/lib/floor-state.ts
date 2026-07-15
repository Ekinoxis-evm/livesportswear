/**
 * Pure write-side floor state math: what taking, finishing, or undoing a
 * client does to the counters. Ordering lives in floor-queue.ts; this file is
 * the single source of truth for the transitions floor-core applies.
 */

export type ClientKind = "walkin" | "return";
export type FloorStatus = "available" | "attending";
export type OpenCounts = { walkins: number; returns: number };

/**
 * Open customers of `kind`. A legacy row that says status=attending with both
 * counters at zero counts as ONE walk-in — the same coercion floor-queue's
 * openClients applies, so old rows stay finishable instead of getting bricked
 * by the close guards.
 */
export function openOfKind(
  counts: OpenCounts,
  status: FloorStatus,
  kind: ClientKind,
): number {
  const n = kind === "walkin" ? counts.walkins : counts.returns;
  if (n > 0) return n;
  if (
    kind === "walkin" &&
    status === "attending" &&
    counts.walkins === 0 &&
    counts.returns === 0
  ) {
    return 1;
  }
  return 0;
}

/** Gate for finish AND undo: is there an open customer of this kind? */
export function canClose(
  counts: OpenCounts,
  status: FloorStatus,
  kind: ClientKind,
): boolean {
  return openOfKind(counts, status, kind) > 0;
}

/** Counters after opening one customer of `kind`. */
export function afterTake(counts: OpenCounts, kind: ClientKind): OpenCounts {
  return {
    walkins: counts.walkins + (kind === "walkin" ? 1 : 0),
    returns: counts.returns + (kind === "return" ? 1 : 0),
  };
}

/** Counters after closing/undoing one customer of `kind` (clamped at 0). */
export function afterClose(counts: OpenCounts, kind: ClientKind): OpenCounts {
  return {
    walkins: Math.max(0, counts.walkins - (kind === "walkin" ? 1 : 0)),
    returns: Math.max(0, counts.returns - (kind === "return" ? 1 : 0)),
  };
}

/** "attending" while any open customer remains, else "available". */
export function statusAfter(counts: OpenCounts): FloorStatus {
  return counts.walkins + counts.returns > 0 ? "attending" : "available";
}

/** Only a finished walk-in burns a turn; a return never does. */
export function rotationAfterFinish(rotation: number, kind: ClientKind): number {
  return kind === "walkin" ? rotation + 1 : rotation;
}
