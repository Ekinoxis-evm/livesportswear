-- =============================================================================
-- 0009 — In-store conversion tracking, monthly store goals, per-location admins
--
-- Three new feature areas:
--   1. client_events     — one row per customer an employee attends (the
--                          conversion engine: attended / sold / got-contact).
--   2. store_day_closes  — end-of-day snapshot per (location, date) produced by
--                          the "Close day" action; drives the daily email report.
--   3. store_goals       — monthly sales target per location (12 months/year).
--
-- Plus the foundation for per-location admins: a master admin sees every
-- location; a scoped admin (app_metadata.admin_scope = 'location') sees only the
-- locations mapped to them in admin_locations. Existing single admins have no
-- admin_scope claim and are therefore treated as master (back-compatible).
-- The rewrite of the *existing* tables' policies to be location-aware lands in a
-- later migration; here only the new tables are location-scoped.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- per-location admin helpers
-- -----------------------------------------------------------------------------

-- An admin with access to every location. Back-compat: an admin with no
-- admin_scope claim (the original single admin) counts as master.
create or replace function public.is_master_admin()
returns boolean language sql stable as $$
  select public.is_admin()
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'admin_scope', 'master') = 'master';
$$;

-- Maps a scoped admin to the location(s) they may manage.
create table if not exists public.admin_locations (
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  location_id   uuid not null references public.locations(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (admin_user_id, location_id)
);
alter table public.admin_locations enable row level security;

-- True if the current admin may act on rows belonging to `loc`. Master admins
-- pass for every location; scoped admins only for their mapped locations.
-- security definer so the admin_locations read can't recurse through RLS.
create or replace function public.admin_can_access_location(loc uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() and (
    public.is_master_admin()
    or exists (
      select 1 from public.admin_locations al
      where al.admin_user_id = auth.uid() and al.location_id = loc
    )
  );
$$;

-- admin_locations: master admins manage the mapping; scoped admins read their own.
create policy "admin_locations_master_all" on public.admin_locations
  for all to authenticated
  using (public.is_master_admin())
  with check (public.is_master_admin());
create policy "admin_locations_self_read" on public.admin_locations
  for select to authenticated using (admin_user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- client_events — in-store conversion (attended / sold / got-contact)
-- -----------------------------------------------------------------------------
create table if not exists public.client_events (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete cascade,
  business_date date not null,                       -- location-local day
  attended_at   timestamptz not null default now(),  -- when the rep marked it
  sold          boolean not null default false,
  got_contact   boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists client_events_location_date_idx
  on public.client_events (location_id, business_date);
create index if not exists client_events_employee_date_idx
  on public.client_events (employee_id, business_date);
alter table public.client_events enable row level security;

-- admin: full access to their location(s). employee: read + write only their own.
create policy "client_events_admin_all" on public.client_events
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));
create policy "client_events_self_read" on public.client_events
  for select to authenticated using (employee_id = public.current_employee_id());
create policy "client_events_self_insert" on public.client_events
  for insert to authenticated
  with check (
    employee_id = public.current_employee_id()
    and location_id = public.current_location_id()
  );
create policy "client_events_self_update" on public.client_events
  for update to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());

-- -----------------------------------------------------------------------------
-- store_day_closes — end-of-day snapshot per (location, date)
-- -----------------------------------------------------------------------------
create table if not exists public.store_day_closes (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references public.locations(id) on delete cascade,
  business_date   date not null,
  closed_by       uuid references public.employees(id) on delete set null,
  closed_at       timestamptz not null default now(),
  attended_count  int not null default 0,
  sold_count      int not null default 0,
  contact_count   int not null default 0,
  shopify_sales   numeric(12, 2),   -- filled once Shopify POS keys are connected
  currency        text,
  created_at      timestamptz not null default now(),
  unique (location_id, business_date)
);
create index if not exists store_day_closes_location_date_idx
  on public.store_day_closes (location_id, business_date);
alter table public.store_day_closes enable row level security;

-- admin: their location(s). employee: read + close their own location's day.
create policy "store_day_closes_admin_all" on public.store_day_closes
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));
create policy "store_day_closes_location_read" on public.store_day_closes
  for select to authenticated using (location_id = public.current_location_id());
create policy "store_day_closes_location_insert" on public.store_day_closes
  for insert to authenticated with check (location_id = public.current_location_id());

-- -----------------------------------------------------------------------------
-- store_goals — monthly sales target per location
-- -----------------------------------------------------------------------------
create table if not exists public.store_goals (
  location_id uuid not null references public.locations(id) on delete cascade,
  year        int not null,
  month       int not null check (month between 1 and 12),
  goal_amount numeric(12, 2) not null default 0,
  currency    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (location_id, year, month)
);
alter table public.store_goals enable row level security;

create trigger store_goals_updated_at
  before update on public.store_goals
  for each row execute function public.tg_set_updated_at();

-- admin: their location(s). employee: read their own location's goal (progress).
create policy "store_goals_admin_all" on public.store_goals
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));
create policy "store_goals_location_read" on public.store_goals
  for select to authenticated using (location_id = public.current_location_id());
