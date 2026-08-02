import { overlaps } from "@/lib/scheduling/conflicts";

export type CoShift = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
};

/**
 * The sorted names of OTHER employees whose same-day shift overlaps the
 * target's — i.e. who you're actually on the floor with during this shift.
 * Same date + time overlap (via the scheduling `overlaps` helper); self and
 * non-overlapping shifts excluded, ids deduped. A missing name renders "—".
 * Pure: no DB, no clock. Used by the published-schedule email + its .ics event.
 */
export function overlappingCoworkerNames(
  target: CoShift,
  all: CoShift[],
  nameOf: Map<string, string>,
): string[] {
  const ids = new Set<string>();
  for (const s of all) {
    if (s.employee_id === target.employee_id) continue;
    if (s.date !== target.date) continue;
    if (overlaps(target, s)) ids.add(s.employee_id);
  }
  return [...ids]
    .map((id) => nameOf.get(id) ?? "—")
    .sort((a, b) => a.localeCompare(b));
}
