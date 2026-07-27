-- Keep the raw attend START alongside the duration for an audit trail. The
-- finish is already client_events.attended_at and the elapsed time is
-- served_seconds (0056); this stores when the client was taken. Written at
-- finish from the popped floor_checkins.attending_started_at entry. Null for
-- pre-0057 rows and for undo/re-take paths that record no duration.
alter table public.client_events
  add column if not exists attend_started_at timestamptz;

comment on column public.client_events.attend_started_at is
  'When the client was taken (turn start); finish is attended_at, elapsed is served_seconds.';
