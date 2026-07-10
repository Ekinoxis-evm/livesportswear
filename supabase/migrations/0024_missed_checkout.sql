-- Missed check-outs: an employee who never taps "check out" before the
-- store-local midnight used to leave their row open forever (hours = null,
-- no close affordance anywhere). A daily sweep (/api/cron/stale-checkins)
-- now closes such rows — left_at = their published shift end that day, or
-- local midnight as fallback — and flags them so payroll can review.
alter table public.floor_checkins
  add column if not exists exit_missed boolean not null default false;
