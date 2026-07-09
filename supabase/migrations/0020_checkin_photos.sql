-- Face-photo evidence for kiosk check-in/out (stored 30 days, see
-- /api/cron/photo-retention). Private bucket: NO read policy on purpose —
-- photos are served only via short-lived signed URLs minted server-side,
-- and written only by the service client from store server actions.
insert into storage.buckets (id, name, public)
  values ('checkin-photos', 'checkin-photos', false)
  on conflict (id) do nothing;

alter table public.floor_checkins
  add column if not exists entry_photo_path text,
  add column if not exists exit_photo_path text;
