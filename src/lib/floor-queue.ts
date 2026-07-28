/**
 * Pure rotation-queue ("up system") ordering. No DB, no time.
 *
 * The line is FIFO by availability: whoever became available first is "up" —
 * first to finish their customer is first in line for the next one.
 * availableSince is stamped at check-in, on finishing a WALK-IN, and on
 * returning from a break (all three send you to the back); returns, undo, and
 * back-to-line keep the old stamp, so none of those cost the member their spot.
 * Two overrides, in precedence order:
 *   1. bump ("make up next", latest wins) — an explicit "you're up NOW";
 *   2. manual position (kiosk drag-reorder) — a full-line arrangement.
 * Taking a walk-in clears both for that member, so FIFO fairness resumes
 * naturally. A rep with an open WALK-IN is out of the running for "up" until it
 * finishes; an open RETURN is NON-BLOCKING — they keep their turn and stay
 * takeable (flagged `onReturn` for the board's highlight).
 */

export type FloorMember = {
  employeeId: string;
  name: string;
  arrivedAt: string; // ISO
  availableSince: string; // ISO — when the member (re)joined the line
  leftAt: string | null;
  status: "available" | "attending";
  rotationCount: number; // clients taken today — displayed, never orders
  bumpedAt: string | null; // ISO — manual "make up next" override; latest wins
  manualPos?: number | null; // drag-reorder position; null = FIFO order
  attendingCount?: number; // open walk-in customers
  returnCount?: number; // open returns/exchanges
  onBreak?: boolean; // open break — off the line, line position kept
};

type QueueState = "up" | "waiting" | "attending" | "break";
export type QueueRow = FloorMember & {
  state: QueueState;
  turn: number | null;
  onReturn: boolean; // has an open return (non-blocking — stays in the line)
};

function byTurn(a: FloorMember, b: FloorMember): number {
  if (a.bumpedAt || b.bumpedAt) {
    if (!b.bumpedAt) return -1;
    if (!a.bumpedAt) return 1;
    return b.bumpedAt.localeCompare(a.bumpedAt);
  }
  const am = a.manualPos ?? null;
  const bm = b.manualPos ?? null;
  if (am != null || bm != null) {
    // A member whose manual position was cleared (they took a customer)
    // falls behind everyone still holding a dragged position.
    if (bm == null) return -1;
    if (am == null) return 1;
    return am - bm;
  }
  return (
    a.availableSince.localeCompare(b.availableSince) ||
    a.arrivedAt.localeCompare(b.arrivedAt)
  );
}

/**
 * Open WALK-INS decide line membership — a walk-in takes a rep out of the line.
 * A return is non-blocking (counted separately, `openReturns`). `status` is the
 * legacy pre-counter signal: a plain attending row with no counts and no return
 * reads as one open walk-in.
 */
function openWalkins(m: FloorMember): number {
  const w = m.attendingCount ?? 0;
  if (w > 0) return w;
  return m.status === "attending" && (m.returnCount ?? 0) === 0 ? 1 : 0;
}
function openReturns(m: FloorMember): number {
  return m.returnCount ?? 0;
}

/** Ordered present members: the available line (in turn order), attending, then on break. */
export function orderFloor(members: FloorMember[]): QueueRow[] {
  const present = members.filter((m) => !m.leftAt);
  // Only an open WALK-IN removes a rep from the line; a return keeps their spot.
  const available = present
    .filter((m) => openWalkins(m) === 0 && !m.onBreak)
    .sort(byTurn);
  const attending = present.filter((m) => openWalkins(m) > 0);
  // On break = off the line entirely; ending it restamps availableSince, so
  // they rejoin at the back (handled in storeEndBreak, not here).
  const onBreak = present.filter((m) => openWalkins(m) === 0 && m.onBreak);

  const row = (m: FloorMember, state: QueueState, turn: number | null): QueueRow => ({
    ...m,
    state,
    turn,
    onReturn: openReturns(m) > 0,
  });
  const rows: QueueRow[] = [];
  available.forEach((m, i) => rows.push(row(m, i === 0 ? "up" : "waiting", i + 1)));
  attending.forEach((m) => rows.push(row(m, "attending", null)));
  onBreak.forEach((m) => rows.push(row(m, "break", null)));
  return rows;
}

/** The employee who should take the next customer, or null if none available. */
export function upNext(members: FloorMember[]): FloorMember | null {
  return orderFloor(members).find((r) => r.state === "up") ?? null;
}
