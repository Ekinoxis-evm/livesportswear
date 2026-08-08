-- Recurring kiosk reminders: a chore the floor has to do on a schedule (the
-- first one is spraying the store perfume) surfaces as a blocking popup on the
-- store screen until someone taps Done.
--
-- The schedule is start + interval + end rather than a hand-typed list of
-- times, so it stays a rule instead of a set of magic numbers. The generated
-- slots are pure (`reminderTimes`, src/lib/reminders.ts) and previewed in the
-- admin form, because "every 3h from 10:00 to 21:00" is 10·13·16·19 — the last
-- step lands past the end — and that is worth SEEING before it reaches the floor.

create table public.store_reminders (
  id                uuid primary key default gen_random_uuid(),
  location_id       uuid not null references public.locations(id) on delete cascade,
  label             text not null,
  note              text,
  start_time        time not null,
  end_time          time not null,
  interval_minutes  int  not null check (interval_minutes between 15 and 720),
  active            boolean not null default true,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (end_time >= start_time)
);

create index store_reminders_location on public.store_reminders (location_id) where active;

alter table public.store_reminders enable row level security;

-- Admin-only, location-scoped (mirrors message_templates / store_report_recipients).
-- The kiosk reads through a service-client store action scoped by its JWT
-- location, so it needs no policy of its own — same single-writer posture as
-- the rest of the floor.
create policy "store_reminders_admin_all" on public.store_reminders
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));

create trigger set_store_reminders_updated_at
  before update on public.store_reminders
  for each row execute function public.tg_set_updated_at();

-- One row per slot actually cleared. The PRIMARY KEY is the slot itself, so a
-- double tap or a client retry cannot write it twice — the same idempotency
-- guard store_day_closes uses for the day. A missing row simply means "not done
-- yet"; nothing is ever updated or deleted here.
create table public.store_reminder_acks (
  reminder_id   uuid not null references public.store_reminders(id) on delete cascade,
  business_date date not null,          -- store-local day (businessDate(tz))
  due_at        time not null,          -- which generated slot was cleared
  acked_at      timestamptz not null default now(),
  primary key (reminder_id, business_date, due_at)
);

create index store_reminder_acks_day on public.store_reminder_acks (business_date);

alter table public.store_reminder_acks enable row level security;

-- Admins can read the history (via the parent reminder's location). Writes come
-- only from the kiosk's service-client action, which re-scopes to the JWT location.
create policy "store_reminder_acks_admin_read" on public.store_reminder_acks
  for select to authenticated
  using (
    exists (
      select 1 from public.store_reminders r
      where r.id = reminder_id
        and public.admin_can_access_location(r.location_id)
    )
  );
