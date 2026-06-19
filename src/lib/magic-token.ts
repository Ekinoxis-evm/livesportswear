import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Per-employee capability token for the public schedule URL (/s/{token}).
 * 32 random bytes, base64url-encoded -> 43 chars. See .claude/rules/security.md:
 * never log this value, never put it in error messages or admin URLs.
 */
export function generateMagicToken(): string {
  return randomBytes(32).toString("base64url");
}
