import { countryFromPhone } from "@/lib/phone-country";

/**
 * One-tap ways to reach a client. Both return null when the client can't
 * actually be reached that way — that null is what greys the button out with a
 * reason, instead of opening WhatsApp or a mail client with a blank recipient.
 *
 * Roughly 72% of these clients have a phone and 54% an email, so "not
 * reachable" is a normal state, not an error.
 *
 * Pure: no DB, no network, no clock.
 */

/**
 * wa.me needs a full international number with no punctuation and no leading
 * "+". A local-format number would silently resolve to the wrong country's
 * subscriber, so anything `countryFromPhone` can't place is refused.
 */
export function whatsappLink(phone: string | null | undefined): string | null {
  if (!countryFromPhone(phone)) return null;
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

/** A mailto for a plausible address; null when there's nothing to send to. */
export function mailtoLink(email: string | null | undefined): string | null {
  const value = (email ?? "").trim();
  // Deliberately loose — Shopify already validated these on capture; this only
  // catches blanks and obvious junk that would open an unusable draft.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? `mailto:${encodeURIComponent(value).replace(/%40/g, "@")}`
    : null;
}
