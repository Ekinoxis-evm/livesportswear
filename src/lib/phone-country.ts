import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Country of origin from a customer's phone number.
 *
 * Shopify's `default_address.country_code` is empty for ~98% of these customers,
 * so the dial code is the only signal we have. Customer phones come back in
 * E.164 ("+573001234567"), which is exactly what libphonenumber parses.
 *
 * Nothing here is hand-maintained: dial-code → country comes from
 * `libphonenumber-js` (the maintained port of Google's libphonenumber, so new
 * and reassigned ranges arrive with a version bump), country NAMES come from the
 * runtime's CLDR data via `Intl.DisplayNames`, and the flag is derived from the
 * ISO code arithmetically. No table to go stale.
 *
 * This deliberately does NOT reuse `splitPhone` from lib/dial-codes.ts: that one
 * is for the employee phone field and falls back to Colombia when nothing
 * matches, which would silently invent a country for every unrecognised
 * customer. Here an unknown number stays unknown — a wrong country is worse
 * than a missing one.
 *
 * Pure: no DB, no network, no clock.
 */

export type Country = { iso: string; name: string; flag: string };

// Intl.DisplayNames is not free to construct; one instance for the module.
let regionNames: Intl.DisplayNames | null = null;
function countryName(iso: string): string {
  regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
  return regionNames.of(iso) ?? iso;
}

/** "CO" -> "🇨🇴". Regional-indicator letters are just A-Z offset into a block. */
function flagOf(iso: string): string {
  return String.fromCodePoint(
    ...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/**
 * The country a phone number belongs to, or null when it can't be told —
 * no phone, no country indicator, or a number libphonenumber can't place
 * (e.g. a shared calling code with no distinguishing prefix). Null is a real
 * answer here, not a failure: it's the "unknown origin" bucket.
 */
export function countryFromPhone(phone: string | null | undefined): Country | null {
  const value = (phone ?? "").trim();
  // Without a leading "+" there is no country indicator to read, and guessing a
  // default region is exactly the mistake this module exists to avoid.
  if (!value.startsWith("+")) return null;

  const iso = parsePhoneNumberFromString(value)?.country;
  return iso ? { iso, name: countryName(iso), flag: flagOf(iso) } : null;
}

/** Rebuilds the display shape from a stored ISO code. */
export function countryFromIso(iso: string | null | undefined): Country | null {
  const code = (iso ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return { iso: code, name: countryName(code), flag: flagOf(code) };
}

export type CountryTally = { country: Country | null; clients: number };

/**
 * Clients per country from STORED iso codes — the whole-book rollup. Same
 * ordering contract as `tallyCountries`: biggest first, unknown last.
 *
 * Separate from the phone-based version on purpose: deriving country from the
 * phones we happened to fetch for one page is what made the admin rollup
 * disagree with its own total.
 */
export function countryTally(
  rows: { country_iso: string | null }[],
): CountryTally[] {
  const byIso = new Map<string, CountryTally>();
  let unknown = 0;

  for (const row of rows) {
    const country = countryFromIso(row.country_iso);
    if (!country) {
      unknown += 1;
      continue;
    }
    const tally = byIso.get(country.iso) ?? { country, clients: 0 };
    tally.clients += 1;
    byIso.set(country.iso, tally);
  }

  const known = [...byIso.values()].sort(
    (a, b) =>
      b.clients - a.clients ||
      (a.country?.name ?? "").localeCompare(b.country?.name ?? ""),
  );
  return unknown > 0 ? [...known, { country: null, clients: unknown }] : known;
}

/**
 * Clients per country, biggest first, with the unknown bucket last so it never
 * outranks a real country in the list.
 */
export function tallyCountries(phones: (string | null | undefined)[]): CountryTally[] {
  const byIso = new Map<string, CountryTally>();
  let unknown = 0;

  for (const phone of phones) {
    const country = countryFromPhone(phone);
    if (!country) {
      unknown += 1;
      continue;
    }
    const row = byIso.get(country.iso) ?? { country, clients: 0 };
    row.clients += 1;
    byIso.set(country.iso, row);
  }

  const known = [...byIso.values()].sort(
    (a, b) =>
      b.clients - a.clients ||
      (a.country?.name ?? "").localeCompare(b.country?.name ?? ""),
  );
  return unknown > 0 ? [...known, { country: null, clients: unknown }] : known;
}
