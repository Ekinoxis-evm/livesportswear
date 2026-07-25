-- Drop the legacy attendance_validations table.
--
-- These were one-time QR tokens for the peer entry/exit attestation flow
-- (migration 0015). That flow was removed when the store kiosk (0019) became the
-- only check-in surface — kiosk stamps are recorded validated (device + PIN), so
-- no QR is ever issued and nothing in the app has read or written this table
-- since. It survived only in the schema + generated types. `cascade` clears the
-- FK from floor_checkins; no live data depends on it.
drop table if exists public.attendance_validations cascade;
