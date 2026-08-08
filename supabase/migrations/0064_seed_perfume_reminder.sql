-- Seed the store-perfume reminder every active location asked for, so the
-- feature arrives switched ON rather than waiting for someone to configure it.
--
-- Every 2 hours, 10:00 → 21:00 store-local. Remember the end is a BOUND, not a
-- slot (`reminderTimes`, src/lib/reminders.ts), so this fires at:
--   10:00 · 12:00 · 14:00 · 16:00 · 18:00 · 20:00
-- 22:00 would be the next step and is past the end, so there is no 21:00 spray.
-- Editable from /admin/locations → Kiosk reminders; this is a starting point,
-- not a fixed rule.
--
-- Guarded by `not exists` on the label so re-running (or a store that already
-- set its own up) can't create a duplicate.

insert into public.store_reminders
  (location_id, label, note, start_time, end_time, interval_minutes, active)
select
  l.id,
  'Spray the store perfume',
  'Give the floor and the fitting rooms a few sprays.',
  '10:00',
  '21:00',
  120,
  true
from public.locations l
where l.active
  and not exists (
    select 1 from public.store_reminders r
    where r.location_id = l.id
      and r.label = 'Spray the store perfume'
  );
