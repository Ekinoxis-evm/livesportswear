---
description: Dry-run the publish workflow locally with Resend in sandbox mode.
argument-hint: "<location-slug> <YYYY-MM-DD (week-start, Monday)>"
---

Dry-run the publish workflow for location `$ARGUMENTS[0]` week starting `$ARGUMENTS[1]`.

1. Ensure `RESEND_DRY_RUN=true` is set in `.env.local`. If missing, add it and remind the user.
2. Fetch the draft schedule from the local Supabase. If none exists, run `/seed` first and create a draft in the UI.
3. Run `validateSchedule` (`src/lib/scheduling/rules.ts`) on the snapshot and print all violations grouped by level.
4. If there are blocking violations, stop and list them.
5. Otherwise simulate the send side WITHOUT calling `publishSchedule` (it has no dry-run mode — it really publishes, writes `audit_log`, and requires an admin session):
   - Render `SchedulePublishedEmail` (`src/lib/emails/schedule-published.tsx`) to HTML for each employee with shifts; print recipient + subject.
   - Generate each employee's ICS feed via `buildEmployeeFeed` (`src/lib/ical.ts`) and validate it parses.
6. Print a summary: emails planned, ICS bytes, total shifts.
7. If the user explicitly wants a real local publish, call `publishSchedule(scheduleId)` from `src/server/schedules.ts` with `RESEND_DRY_RUN=true` — sends become logged stubs but the DB write is real.

Never call this against a production Supabase URL or with `RESEND_DRY_RUN=false`.
