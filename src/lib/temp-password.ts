import "server-only";
import { randomBytes } from "node:crypto";

/** A readable, strong temporary password (no ambiguous characters). */
export function tempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (const b of randomBytes(10)) out += chars[b % chars.length];
  return `Live-${out}`;
}
