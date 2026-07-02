/**
 * Pure worked-hours math for a day's check-in. No DB, no time.
 *
 * Validation is attestation, not gating: hours always compute from the
 * recorded arrival/departure; the status only describes how trustworthy each
 * stamp is (peer-validated, self-validated first-in/last-out, or pending).
 */

export type AttendanceStamp = {
  at: string | null; // recorded time (arrived_at / left_at), ISO
  validatedAt: string | null;
  self: boolean; // first-in / last-out self-validation flag
};

export type StampStatus = "validated" | "self" | "pending" | "none";

export function stampStatus(stamp: AttendanceStamp): StampStatus {
  if (!stamp.at) return "none";
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
