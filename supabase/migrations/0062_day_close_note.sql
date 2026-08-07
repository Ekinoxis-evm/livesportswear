-- The closer's note on the day's report: free text typed at the kiosk (or
-- pasted in from wherever it was drafted) that ships in the report email and
-- stays with the day's snapshot. The numbers alone can't say the POS was down
-- for an hour, or that two walk-ins never got logged.
--
-- Optional and nullable: most days have nothing to add, and every close before
-- 0062 has no note. Written ONLY by a real close (`closeDayFor`) — a [TEST]
-- send writes no store_day_closes row at all, so a test note is emailed and
-- never stored. Cleaned + length-capped by `cleanNote` (src/lib/report-note.ts)
-- before it lands here.
--
-- No RLS change: the table's admin/location policies already cover new columns.

alter table public.store_day_closes
  add column if not exists note text;
