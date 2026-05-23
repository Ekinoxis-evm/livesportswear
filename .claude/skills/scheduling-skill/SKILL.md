---
name: scheduling-skill
description: Use when modifying the publish workflow, schedule validation, or coverage stats. Encodes the canonical publish algorithm and validation order.
---

# Scheduling Skill — How we model and validate schedules

## Mental model
A schedule is a set of `(employee_id, date, start_time, end_time)` rows scoped to one `(location_id, week_start)`. It is **draft** until validated + published.

## Publish algorithm (canonical)

```text
publishSchedule(schedule_id, admin_user_id):
  1. LOAD schedule + shifts + employees + templates + approved time-off (DB read)
  2. snapshot = freeze({ schedule, shifts, employees, templates, timeOff })
  3. violations = validateSchedule(snapshot)   // pure
  4. if violations.some(v => v.level === "block"):
       return { ok: false, violations }
  5. BEGIN transaction:
       a. UPDATE schedules SET status='published', published_at=now(), published_by=admin
       b. INSERT audit_log row with diff vs. previous published snapshot
     COMMIT
  6. For each affected employee:
       - render `schedule-published` email with their week's shifts
       - generate ICS attachment + magic URL
       - enqueue `sendSafe(...)` (NOT awaited inside the tx)
  7. Compute diff against previous published version; for each *changed* employee shift, also send `shift-changed`.
  8. Return { ok: true, sent: N }
```

## Validation order matters
1. Structural (overlapping shifts) → block
2. Time-off conflict → block
3. Per-employee limits (`max_days_per_week`, `weekly_days_off`) → block
4. Soft warnings (preferred days off, coverage, hour target) → warn

Reason: cheap checks first; we never run "preferred day off" warnings if the schedule has hard conflicts.

## Stats correctness
Per-employee weekly hours = `sum(end_time - start_time)` where `start_time/end_time` are in the location's local timezone. We do not adjust for DST because shift times are stored local; a 09:30→17:30 shift is 8h regardless of DST.

Monthly hours = sum across the calendar month in the location's timezone (so the boundary between Jan 31 and Feb 1 is local-midnight, not UTC-midnight).

## What lives where
- `src/lib/scheduling/rules.ts` — `validateSchedule()`, returns `Violation[]`
- `src/lib/scheduling/stats.ts` — pure stats functions
- `src/lib/scheduling/publish.ts` — `publishSchedule()`, orchestrates the algorithm above
- `src/lib/scheduling/week.ts` — Monday-anchored week math

Never put DB calls in `rules.ts` or `stats.ts`. `publish.ts` does the DB reads/writes via the supabase server client.
