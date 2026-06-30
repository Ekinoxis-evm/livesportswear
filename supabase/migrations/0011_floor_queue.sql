-- =============================================================================
-- 0011 — Shop-floor rotation queue ("up system")
--
-- The daily following: a lead opens the day, employees check in in arrival
-- order, and customers are served round-robin. The person who is "up" takes the
-- next walk-in (status = attending); when they finish (sold / no sale) their
-- rotation_count increments and they drop to the back of the line.
--
--   floor_days     — marks a store day open for the queue (opened_by/at)
--   floor_checkins — one row per present employee: arrival time, on/off floor,
--                    current status, and rotation_count (drives "up next")
--
-- Floor data is shared within a store, so any employee at the location can read
-- and write it (the app guides who does what); admins are location-scoped.
-- =============================================================================

create table if not exists public.floor_days (
  location_id   uuid not null references public.locations(id) on delete cascade,
  business_date date not null,
  opened_by     uuid references public.employees(id) on delete set null,
  opened_at     timestamptz not null default now(),
  primary key (location_id, business_date)
);
alter table public.floor_days enable row level security;

create policy "floor_days_admin_all" on public.floor_days
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));
create policy "floor_days_location_read" on public.floor_days
  for select to authenticated using (location_id = public.current_location_id());
create policy "floor_days_location_insert" on public.floor_days
  for insert to authenticated with check (location_id = public.current_location_id());

create table if not exists public.floor_checkins (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references public.locations(id) on delete cascade,
  employee_id    uuid not null references public.employees(id) on delete cascade,
  business_date  date not null,
  arrived_at     timestamptz not null default now(),
  left_at        timestamptz,
  status         text not null default 'available'
                   check (status in ('available', 'attending')),
  rotation_count int not null default 0,
  created_at     timestamptz not null default now(),
  unique (location_id, business_date, employee_id)
);
create index if not exists floor_checkins_loc_date_idx
  on public.floor_checkins (location_id, business_date);
alter table public.floor_checkins enable row level security;

create policy "floor_checkins_admin_all" on public.floor_checkins
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));
create policy "floor_checkins_location_read" on public.floor_checkins
  for select to authenticated using (location_id = public.current_location_id());
create policy "floor_checkins_location_insert" on public.floor_checkins
  for insert to authenticated with check (location_id = public.current_location_id());
create policy "floor_checkins_location_update" on public.floor_checkins
  for update to authenticated
  using (location_id = public.current_location_id())
  with check (location_id = public.current_location_id());
