/**
 * Curated IANA timezones for the location picker (covers Live Active Wear's
 * markets). Any valid IANA zone is still accepted server-side via isValidTimezone.
 */
export const COMMON_TIMEZONES = [
  "America/Bogota",
  "America/Lima",
  "America/Mexico_City",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Santiago",
  "America/Sao_Paulo",
  "Europe/Madrid",
  "UTC",
] as const;

export function isValidTimezone(tz: string): boolean {
  try {
    // Throws RangeError for unknown zones.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
