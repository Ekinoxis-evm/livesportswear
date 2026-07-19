/**
 * Pure rotation-queue ("up system") ordering. No DB, no time.
 *
 * The line is FIFO by availability: whoever became available first is "up" —
 * first to finish their customer is first in line for the next one.
 * availableSince is stamped at check-in and on finishing a WALK-IN; returns,
 * undo, back-to-line, and break-end keep the old stamp, so none of those
 * cost the member their spot. Two overrides, in precedence order:
 *   1. bump ("make up next", latest wins) — an explicit "you're up NOW";
 *   2. manual position (kiosk drag-reorder) — a full-line arrangement.
 * Taking a walk-in clears both for that member, so FIFO fairness resumes
 * naturally. People currently attending are out of the running until every
 * one of their open customers is finished.
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
export type QueueRow = FloorMember & { state: QueueState; turn: number | null };

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

/** Open customers for a member (counts win; `status` is the legacy signal). */
function openClients(m: FloorMember): number {
  const counted = (m.attendingCount ?? 0) + (m.returnCount ?? 0);
  if (counted > 0) return counted;
  return m.status === "attending" ? 1 : 0;
}

/** Ordered present members: the available line (in turn order), attending, then on break. */
export function orderFloor(members: FloorMember[]): QueueRow[] {
  const present = members.filter((m) => !m.leftAt);
  const available = present
    .filter((m) => openClients(m) === 0 && !m.onBreak)
    .sort(byTurn);
  const attending = present.filter((m) => openClients(m) > 0);
  // availableSince/manual position untouched while away — ending the break
  // drops them back into their exact former spot in the line.
  const onBreak = present.filter((m) => openClients(m) === 0 && m.onBreak);

  const rows: QueueRow[] = [];
  available.forEach((m, i) =>
    rows.push({ ...m, state: i === 0 ? "up" : "waiting", turn: i + 1 }),
  );
  attending.forEach((m) => rows.push({ ...m, state: "attending", turn: null }));
  onBreak.forEach((m) => rows.push({ ...m, state: "break", turn: null }));
  return rows;
}

/** The employee who should take the next customer, or null if none available. */
export function upNext(members: FloorMember[]): FloorMember | null {
  return orderFloor(members).find((r) => r.state === "up") ?? null;
}
