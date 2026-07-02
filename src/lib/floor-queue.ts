/**
 * Pure rotation-queue ("up system") ordering. No DB, no time.
 *
 * Whoever is present and available with the fewest customers taken (ties broken
 * by earliest arrival) is "up" — they take the next walk-in. A manual bump
 * ("make up next") overrides that order until the bumped member takes a
 * customer. People currently attending a customer are out of the running until
 * they finish.
 */

export type FloorMember = {
  employeeId: string;
  name: string;
  arrivedAt: string; // ISO
  leftAt: string | null;
  status: "available" | "attending";
  rotationCount: number;
  bumpedAt: string | null; // ISO — manual "make up next" override; latest wins
};

export type QueueState = "up" | "waiting" | "attending";
export type QueueRow = FloorMember & { state: QueueState; turn: number | null };

function byTurn(a: FloorMember, b: FloorMember): number {
  if (a.bumpedAt || b.bumpedAt) {
    if (!b.bumpedAt) return -1;
    if (!a.bumpedAt) return 1;
    return b.bumpedAt.localeCompare(a.bumpedAt);
  }
  return a.rotationCount - b.rotationCount || a.arrivedAt.localeCompare(b.arrivedAt);
}

/** Ordered present members: the available line (in turn order) then attending. */
export function orderFloor(members: FloorMember[]): QueueRow[] {
  const present = members.filter((m) => !m.leftAt);
  const available = present.filter((m) => m.status === "available").sort(byTurn);
  const attending = present.filter((m) => m.status === "attending");

  const rows: QueueRow[] = [];
  available.forEach((m, i) =>
    rows.push({ ...m, state: i === 0 ? "up" : "waiting", turn: i + 1 }),
  );
  attending.forEach((m) => rows.push({ ...m, state: "attending", turn: null }));
  return rows;
}

/** The employee who should take the next customer, or null if none available. */
export function upNext(members: FloorMember[]): FloorMember | null {
  return orderFloor(members).find((r) => r.state === "up") ?? null;
}
