/**
 * Time helpers used by the rules engine. Pure. Times are `HH:MM` or `HH:MM:SS`.
 */

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Shift length in minutes; a non-positive span is treated as crossing midnight. */
export function shiftDurationMinutes(start: string, end: string): number {
  let diff = toMinutes(end) - toMinutes(start);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

/** True if two same-day time ranges overlap. */
export function overlaps(
  a: { start_time: string; end_time: string },
  b: { start_time: string; end_time: string },
): boolean {
  return (
    toMinutes(a.start_time) < toMinutes(b.end_time) &&
    toMinutes(b.start_time) < toMinutes(a.end_time)
  );
}
