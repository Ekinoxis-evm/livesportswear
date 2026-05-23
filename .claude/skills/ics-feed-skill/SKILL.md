---
name: ics-feed-skill
description: Use when changing the per-employee ICS feed, the magic-token route, or timezone handling for calendar events.
---

# ICS Feed Skill — Per-employee calendar subscription

## Route
`GET /s/{magic_token}/calendar.ics`

## Behavior
1. Look up the employee by `magic_token` in constant time (single indexed query). Return 404 on miss.
2. Fetch the employee's published shifts in a window of `[today - 30d, today + 90d]`.
3. Build an ICS feed:
   - `PRODID` = `-//Live Active Wear//Schedule//EN`
   - `X-WR-CALNAME` = `Live — {employee.name}`
   - `X-WR-TIMEZONE` = the location's IANA TZ
   - One `VEVENT` per shift:
     - `UID` = `shift-{shift_id}@live.app`
     - `DTSTART` with `TZID={location.timezone}`
     - `DTEND` with `TZID={location.timezone}`
     - `SUMMARY` = `{shift_template.name} · {location.name}`
     - `LOCATION` = `{location.address}`
4. Respond with `Content-Type: text/calendar; charset=utf-8` and `Cache-Control: private, no-cache, no-store, max-age=0`.

## Why no-cache
Calendar clients (iOS, Google Calendar, Outlook) re-fetch the feed periodically. We always serve fresh data — caching on our side creates ghost-shift bugs after edits.

## Timezone correctness
- We use `ical-generator` with `timezone: location.timezone` per VEVENT. Do not convert to UTC manually — leave that to the calendar client via TZID.
- For locations across DST boundaries, `ical-generator` emits VTIMEZONE blocks when configured with `events[].timezone`.

## Library
`ical-generator` v9+. Wrap in `src/lib/ical.ts`:
```ts
export function buildEmployeeFeed(input: {
  employee: Employee;
  location: Location;
  shifts: Shift[];
}): string;
```

Pure function — no DB, no Resend. Always testable.

## Snapshot test
`tests/ics.spec.ts` — feed a deterministic input, snapshot the output, fail on changes. ICS is text and stable line-by-line.
