-- =============================================================================
-- 0003 — Employee accounts, role-aware RLS, compensation, avatars
--
-- Introduces a second user type (employees) alongside the admin. Roles come
-- from the Supabase JWT claim app_metadata.role ('admin' | 'employee').
-- Replaces the v1 "authenticated = full access" policies from 0002.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- schema additions
-- -----------------------------------------------------------------------------
alter table public.employees
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table public.employees
  add column if not exists avatar_url text;

-- Hourly rate kept in a separate, admin-only table so it is invisible to
-- employees by plain default-deny (no column-level RLS needed).
create table if not exists public.employee_compensation (
  employee_id  uuid primary key references public.employees(id) on delete cascade,
  hourly_rate  numeric(10,2),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.employee_compensation enable row level security;

create trigger employee_compensation_updated_at
  before update on public.employee_compensation
  for each row execute function public.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- role / identity helpers
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- security definer to bypass RLS on employees (avoids policy recursion).
create or replace function public.current_employee_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.employees where auth_user_id = auth.uid();
$$;

create or replace function public.current_location_id()
returns uuid language sql stable security definer set search_path = public as $$
  select location_id from public.employees where auth_user_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- RLS rewrite (drop the 0002 authenticated-wide policies, add role-aware ones)
-- -----------------------------------------------------------------------------

-- locations: readable by any authenticated user (not sensitive); admin writes.
drop policy if exists "admin_select_locations" on public.locations;
drop policy if exists "admin_write_locations" on public.locations;
create policy "locations_read" on public.locations
  for select to authenticated using (true);
create policy "locations_admin_write" on public.locations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- shift_templates: same shape as locations.
drop policy if exists "admin_select_templates" on public.shift_templates;
drop policy if exists "admin_write_templates" on public.shift_templates;
create policy "templates_read" on public.shift_templates
  for select to authenticated using (true);
create policy "templates_admin_write" on public.shift_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- employees: admin full; employee may read only their own row. Employee profile
-- edits (photo) go through a service-role server action, not a write policy,
-- so reps can't alter their own rules/role/location.
drop policy if exists "admin_select_employees" on public.employees;
drop policy if exists "admin_write_employees" on public.employees;
create policy "employees_admin_all" on public.employees
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "employees_self_read" on public.employees
  for select to authenticated using (auth_user_id = auth.uid());

-- schedules: admin full; employee reads their own location's schedules.
drop policy if exists "admin_select_schedules" on public.schedules;
drop policy if exists "admin_write_schedules" on public.schedules;
create policy "schedules_admin_all" on public.schedules
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "schedules_location_read" on public.schedules
  for select to authenticated using (location_id = public.current_location_id());

-- shifts: admin full; employee reads only their own shifts.
drop policy if exists "admin_select_shifts" on public.shifts;
drop policy if exists "admin_write_shifts" on public.shifts;
create policy "shifts_admin_all" on public.shifts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "shifts_self_read" on public.shifts
  for select to authenticated using (employee_id = public.current_employee_id());

-- time_off_requests: admin full; employee reads + submits their own.
drop policy if exists "admin_select_time_off" on public.time_off_requests;
drop policy if exists "admin_write_time_off" on public.time_off_requests;
create policy "time_off_admin_all" on public.time_off_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "time_off_self_read" on public.time_off_requests
  for select to authenticated using (employee_id = public.current_employee_id());
create policy "time_off_self_insert" on public.time_off_requests
  for insert to authenticated with check (employee_id = public.current_employee_id());

-- audit_log: admin reads; writes via service role only (no insert policy).
drop policy if exists "admin_select_audit" on public.audit_log;
create policy "audit_admin_read" on public.audit_log
  for select to authenticated using (public.is_admin());

-- employee_compensation: admin only. Employees get no policy → denied.
create policy "comp_admin_all" on public.employee_compensation
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- avatars storage bucket (public read; uploads go through the service client)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
