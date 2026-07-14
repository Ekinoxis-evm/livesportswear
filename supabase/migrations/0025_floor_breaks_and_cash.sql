-- Breaks: an on-floor employee steps off the line without checking out.
-- Tracked only — worked hours stay checkout − checkin; the 30-min daily
-- budget is flagged, not enforced. Multiple breaks per day; ended_at null =
-- ongoing. RLS mirrors the post-0023 floor posture: admins full access,
-- location JWTs READ ONLY, all writes via the PIN-gated service-role kiosk
-- actions in src/server/store-floor.ts.
create table if not exists public.floor_breaks (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  business_date date not null,
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists floor_breaks_loc_date_idx
  on public.floor_breaks (location_id, business_date);

-- At most ONE open break per employee per day — the DB enforces what the
-- server action assumes (double-tap safe).
create unique index if not exists floor_breaks_one_open_idx
  on public.floor_breaks (location_id, business_date, employee_id)
  where ended_at is null;

alter table public.floor_breaks enable row level security;

create policy "floor_breaks_admin_all" on public.floor_breaks
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));

create policy "floor_breaks_location_read" on public.floor_breaks
  for select to authenticated
  using (location_id = public.current_location_id());

-- Cash-in-register snapshot at close time (tender_transactions source);
-- created here so this batch ships a single migration.
alter table public.store_day_closes
  add column if not exists cash_sales numeric;
