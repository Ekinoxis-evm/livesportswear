/**
 * Calendar deep-links. Pure. Times are location-local (HH:MM[:SS]); Google's
 * `ctz` param interprets them in the given IANA timezone, so no UTC math here.
 */
export function googleCalendarUrl(input: {
  title: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM[:SS]
  end: string;
  tz: string;
  location?: string;
}): string {
  const day = input.date.replace(/-/g, "");
  const hms = (t: string) => `${t.slice(0, 5).replace(":", "")}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates: `${day}T${hms(input.start)}/${day}T${hms(input.end)}`,
    ctz: input.tz,
  });
  if (input.location) params.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** webcal:// subscription URL (one-tap subscribe in Apple Calendar / Outlook). */
export function webcalUrl(icsHttpsUrl: string): string {
  return icsHttpsUrl.replace(/^https?:\/\//, "webcal://");
}
