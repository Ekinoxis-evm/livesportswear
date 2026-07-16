-- Contest gate modes + per-rep personal goals.
-- goal_source='monthly' gates on the store's configured monthly goal
-- (store_goals for the end date's month, measured on that whole month's
-- attributed sales) instead of a custom number typed into the contest.
-- personal_goals maps employee_id -> target for the contest window; prize
-- items can require beating it (requires_personal on the item jsonb —
-- additive, old items coerce to false in lib/rewards.ts).
alter table public.sales_contests
  add column if not exists goal_source text not null default 'custom'
    check (goal_source in ('custom', 'monthly')),
  add column if not exists personal_goals jsonb not null default '{}'::jsonb;
