-- Per-client attend timer: time each client from when they're taken to when
-- they're finished. `served_seconds` is the recorded duration on each attendance
-- (null for pre-existing rows / clients taken before this migration).
-- `attending_started_at` on floor_checkins is a small QUEUE of the rep's
-- currently-open clients ([{kind, at}]) — pushed on take, popped (oldest of the
-- kind, FIFO) on finish, popped (newest) on undo, cleared on back-to-line. The
-- kiosk is the floor's single writer, so the read-modify-write is safe (same
-- posture as the attending_count counters). No RLS change.
alter table public.client_events
  add column if not exists served_seconds int;

alter table public.floor_checkins
  add column if not exists attending_started_at jsonb;

comment on column public.client_events.served_seconds is
  'Seconds the client was attended (taken → finished); null when not timed.';
comment on column public.floor_checkins.attending_started_at is
  'Queue of the rep''s open clients [{kind, at}] for per-client timing; kiosk single-writer.';
