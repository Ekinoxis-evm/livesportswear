-- Mark a store day's floor as closed.
--
-- Closing the day is a task the closer does during their shift, when the store
-- shuts: it ends the day's queue so the board stops offering "take a client".
-- It deliberately does NOT check anyone out — each person still taps their own
-- PIN checkout, and forcing it here would cut short the hours of anyone still
-- working after the report goes out.
--
-- The floor is reopened simply by the next business date, so this needs no
-- "reopen" path: floor_days is keyed by (location, business_date).
alter table public.floor_days
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.employees(id) on delete set null;

comment on column public.floor_days.closed_at is
  'Set when the day''s report is sent from the kiosk. Ends the queue for that business date; does NOT check anyone out.';
