---
description: Dry-run the publish workflow locally with Resend in sandbox mode.
argument-hint: "<location-slug> <YYYY-MM-DD (week-start, Monday)>"
---

Dry-run the publish workflow for location `$ARGUMENTS[0]` week starting `$ARGUMENTS[1]`.

1. Ensure `RESEND_DRY_RUN=true` is set in `.env.local`. If missing, add it and remind the user.
2. Fetch the draft schedule from the local Supabase. If none exists, run `/seed` first.
3. Run `validateSchedule` and print all violations grouped by level.
4. If there are blocking violations, stop and list them.
5. Otherwise, call `publishSchedule()` in dry-run mode. It must:
   - NOT actually mark the schedule published in the DB
   - Render every email template (publish, shift-change for diffs) to HTML
   - Print recipient + subject for each
   - Generate the ICS feed for each employee and validate it parses
6. Print a summary: emails planned, ICS bytes, total shifts.

Never call this against a production Supabase URL or with `RESEND_DRY_RUN=false`.
