---
name: scheduling-skill
description: Use when modifying the publish workflow, schedule validation, or coverage stats. Encodes the canonical publish algorithm and validation order.
---

# Scheduling Skill — How we model and validate schedules

## Mental model
A schedule is a set of `(employee_id, date, start_time, end_time)` rows scoped to one `(location_id, week_start)`. It is **draft** until validated + published.

## Publish algorithm (canonical)

```text
publishSchedule(scheduleId):                    // src/server/schedules.ts
  0. requireAdmin() — the admin comes from the session, not a parameter
  1. LOAD schedule + shifts + employees + templates + approved time-off (DB read)
  2. snapshot = build ScheduleSnapshot (plain objects)
  3. violations = validateSchedule(snapshot)   // pure, lib/scheduling/rules.ts
  4. if violations.some(v => v.level === "block"):
       return { ok: false, violations }
  5. UPDATE schedules SET status='published', published_at=now(), published_by=admin
  6. INSERT audit_log row (service client — audit_log has no authenticated insert policy)
  7. For each employee with shifts:
       - render SchedulePublishedEmail with their week's shifts
       - include the magic URL + ICS subscribe link
       - sendSafe(...) — honors RESEND_DRY_RUN
  8. Return { ok: true, data: { sent, total } }
```

## Validation order matters
1. Structural (overlapping shifts) → block
2. Time-off conflict → block
3. Per-employee limits (`max_days_per_week`, `weekly_days_off`) → block
4. Soft warnings (coverage, weekly hour target, biweekly-sprint hour cap `ABOVE_BIWEEKLY_HOURS`) → warn

Reason: cheap checks first; warnings only matter once the schedule has no hard conflicts.

## Stats correctness
Per-employee weekly hours = `sum(end_time - start_time)` where `start_time/end_time` are in the location's local timezone. We do not adjust for DST because shift times are stored local; a 09:30→17:30 shift is 8h regardless of DST.

Monthly hours = sum across the calendar month in the location's timezone (so the boundary between Jan 31 and Feb 1 is local-midnight, not UTC-midnight).

## What lives where
- `src/lib/scheduling/rules.ts` — `validateSchedule()`, returns `Violation[]`
- `src/lib/scheduling/stats.ts` — pure stats functions
- `src/lib/scheduling/conflicts.ts` — overlap/conflict helpers
- `src/lib/scheduling/payroll.ts` — pay-sprint (biweekly) math
- `src/lib/scheduling/week.ts` — Monday-anchored week math
- `src/server/schedules.ts` — `publishSchedule()` orchestrates the algorithm above (DB reads/writes + emails; NOT in lib/scheduling — the coverage gate covers pure code only)

Never put DB calls anywhere in `src/lib/scheduling/`.
