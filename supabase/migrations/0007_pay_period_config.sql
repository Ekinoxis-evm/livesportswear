-- =============================================================================
-- 0007 — Move pay-period settings into the admin-managed config row
--
-- Sprint anchor (a Monday) + the biweekly hour cap used to live in env vars;
-- they now live on commission_config (single row id=1) so the admin can edit
-- them in Settings. Seeded with the previous defaults.
-- =============================================================================
alter table public.commission_config
  add column if not exists sprint_anchor_monday date not null default '2026-06-22',
  add column if not exists biweekly_hour_cap int not null default 80;
