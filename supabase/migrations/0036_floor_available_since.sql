-- The line is now FIFO by availability: first to finish is first up.
-- available_since = the moment the member (re)joined the line — stamped at
-- check-in and on finishing a WALK-IN (returns, undo, back-to-line, and
-- break-end keep the old value, so those never cost the spot).
-- rotation_count stays as the displayed "turns today" counter only.

alter table public.floor_checkins add column available_since timestamptz;
update public.floor_checkins set available_since = arrived_at where available_since is null;
