import { createHash } from "crypto";

/**
 * Kiosk PIN: 4 digits confirming who tapped entry/exit on the shared store
 * screen. Hashed with the employee id as salt — low-entropy by design (it's a
 * floor-speed control, not a credential), so it never doubles as a password.
 */

export const PIN_RE = /^\d{4}$/;

export function hashPin(pin: string, employeeId: string): string {
  return createHash("sha256").update(`${employeeId}:${pin}`).digest("hex");
}
