/**
 * Pure rotation-queue ("up system") ordering. No DB, no time.
 *
 * Whoever is present and available with the fewest customers taken (ties broken
 * by earliest arrival) is "up" — they take the next walk-in. Two overrides,
 * in precedence order:
 *   1. bump ("make up next", latest wins) — an explicit "you're up NOW";
 *   2. manual position (kiosk drag-reorder) — a full-line arrangement.
 * Taking a walk-in clears both for that member, so rotation fairness resumes
 * naturally. People currently attending are out of the running until every
 * one of their open customers is finished.
 */

export type FloorMember = {
  employeeId: string;
  name: string;
  arrivedAt: string; // ISO
  leftAt: string | null;
  status: "available" | "attending";
  rotationCount: number;
  bumpedAt: string | null; // ISO — manual "make up next" override; latest wins
  manualPos?: number | null; // drag-reorder position; null = rotation order
  attendingCount?: number; // open walk-in customers
  returnCount?: number; // open returns/exchanges
  onBreak?: boolean; // open break — off the line, rotation position kept
};

export type QueueState = "up" | "waiting" | "attending" | "break";
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
  return a.rotationCount - b.rotationCount || a.arrivedAt.localeCompare(b.arrivedAt);
}

/** Open customers for a member (counts win; `status` is the legacy signal). */
export function openClients(m: FloorMember): number {
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
  // Rotation/manual position untouched while away — ending the break drops
  // them back into their exact former spot in the line.
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
