import { fromZonedTime } from "date-fns-tz";

/**
 * Pure date math + query building for the Shopify sync. No DB, no network —
 * kept out of lib/shopify.ts (server-only) so tests can import it.
 */

/** The month before a YYYY-MM month. */
export function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * A store-local calendar month as UTC ISO instants [start, endExclusive).
 * Shopify's search interprets bare dates as UTC, so boundaries must carry the
 * store's offset or orders near midnight land in the wrong month.
 */
export function monthRangeInTz(
  month: string,
  tz: string,
): { start: string; endExclusive: string } {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return {
    start: fromZonedTime(`${month}-01T00:00:00`, tz).toISOString(),
    endExclusive: fromZonedTime(`${next}-01T00:00:00`, tz).toISOString(),
  };
}

/**
 * Canonical staff id: the numeric tail. REST gives numeric user_id; GraphQL
 * gives gid://shopify/StaffMember/<n> — mappings must compare equal either way.
 */
export function normalizeStaffId(id: string): string {
  const tail = id.split("/").pop() ?? id;
  return tail.trim();
}
