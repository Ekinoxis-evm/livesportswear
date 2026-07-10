import { fromZonedTime } from "date-fns-tz";

/**
 * Pure worked-hours math for a day's check-in. No DB, no time.
 *
 * Validation is attestation, not gating: hours always compute from the
 * recorded arrival/departure; the status only describes how trustworthy each
 * stamp is (peer-validated, self-validated first-in/last-out, pending, or a
 * missed check-out closed by the nightly sweep).
 */

export type AttendanceStamp = {
  at: string | null; // recorded time (arrived_at / left_at), ISO
  validatedAt: string | null;
  self: boolean; // first-in / last-out self-validation flag
  missed?: boolean; // exit auto-closed by the sweep — needs payroll review
};

export type StampStatus = "validated" | "self" | "pending" | "none" | "missed";

export function stampStatus(stamp: AttendanceStamp): StampStatus {
  if (!stamp.at) return "none";
  if (stamp.missed) return "missed";
  if (stamp.self) return "self";
  return stamp.validatedAt ? "validated" : "pending";
}

/** Decimal hours between arrival and departure, rounded to 0.1h. Null while on the floor. */
export function workedHours(arrivedAt: string, leftAt: string | null): number | null {
  if (!leftAt) return null;
  const ms = new Date(leftAt).getTime() - new Date(arrivedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 360000) / 10;
}

/**
 * The exit instant to stamp on a missed check-out: the employee's published
 * shift end that day (location-local "HH:MM[:SS]"), or the local midnight
 * ending the business date when they had no shift. Never earlier than the
 * arrival — a shift end before arrived_at would make workedHours null.
 */
export function missedExitInstant(
  businessDate: string,
  tz: string,
  shiftEnd: string | null,
  arrivedAt: string,
): string {
  const nextDay = new Date(`${businessDate}T00:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const midnight = fromZonedTime(
    `${nextDay.toISOString().slice(0, 10)}T00:00:00`,
    tz,
  );
  const candidate = shiftEnd
    ? fromZonedTime(`${businessDate}T${shiftEnd}`, tz)
    : midnight;
  const arrived = new Date(arrivedAt);
  return (candidate.getTime() >= arrived.getTime() ? candidate : midnight).toISOString();
}
