-- A log of every daily-report send, so a store can SEE which days went out.
--
-- Why this isn't `store_day_closes`: that table answers "was this day closed",
-- one row per day, written once. It cannot answer "was the report actually
-- sent, when, and how many times" — and it says nothing at all about a day that
-- was never closed. Between 2026-08-10 and 08-14 the schedule sat unpublished,
-- so nobody was eligible to close and FIVE days of reports silently never went
-- out. Nothing in the app could show that. This table is what makes a missing
-- day visible, and a resend recordable.
--
-- Append-only: one row per send. `kind` separates the report sent at close from
-- one re-sent afterwards (a backfill of a day that was missed).

create table public.store_report_sends (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references public.locations(id) on delete cascade,
  business_date   date not null,
  sent_at         timestamptz not null default now(),
  kind            text not null check (kind in ('close', 'resend')),
  recipient_count int  not null default 0,
  -- Null for an admin-triggered send: admins have no employees row, and a
  -- backfill has no on-floor closer to attribute it to.
  sent_by         uuid references public.employees(id) on delete set null
);

create index store_report_sends_lookup
  on public.store_report_sends (location_id, business_date desc);

alter table public.store_report_sends enable row level security;

-- Admin-read, location-scoped. Writes come only from the server actions that
-- actually send (service client, re-scoped to the caller's location) — same
-- single-writer posture as the rest of the kiosk.
create policy "store_report_sends_admin_read" on public.store_report_sends
  for select to authenticated
  using (public.admin_can_access_location(location_id));
