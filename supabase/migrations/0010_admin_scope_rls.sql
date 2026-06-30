-- =============================================================================
-- 0010 — Per-location admin RLS
--
-- Switches the admin policies on the existing tenant tables from the blanket
-- is_admin() to admin_can_access_location(<loc>) (added in 0009). Master admins
-- still pass for every location (back-compatible); scoped admins
-- (app_metadata.admin_scope = 'location') are limited to their admin_locations.
--
-- Tables without a direct location_id resolve it through a security-definer
-- lookup so the policy doesn't recurse into the joined table's own RLS.
--
-- Employee-facing policies (…_self_read, …_location_read) are unchanged.
-- locations / shift_templates / commission_config / audit_log stay is_admin()
-- (shared config, not location tenant data).
-- =============================================================================

create or replace function public.schedule_location(s uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select location_id from public.schedules where id = s;
$$;

create or replace function public.employee_location(e uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select location_id from public.employees where id = e;
$$;

-- employees (direct location_id)
drop policy if exists "employees_admin_all" on public.employees;
create policy "employees_admin_all" on public.employees
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));

-- schedules (direct location_id)
drop policy if exists "schedules_admin_all" on public.schedules;
create policy "schedules_admin_all" on public.schedules
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));

-- shifts (location via schedule)
drop policy if exists "shifts_admin_all" on public.shifts;
create policy "shifts_admin_all" on public.shifts
  for all to authenticated
  using (public.admin_can_access_location(public.schedule_location(schedule_id)))
  with check (public.admin_can_access_location(public.schedule_location(schedule_id)));

-- time_off_requests (location via employee)
drop policy if exists "time_off_admin_all" on public.time_off_requests;
create policy "time_off_admin_all" on public.time_off_requests
  for all to authenticated
  using (public.admin_can_access_location(public.employee_location(employee_id)))
  with check (public.admin_can_access_location(public.employee_location(employee_id)));

-- employee_compensation (location via employee)
drop policy if exists "comp_admin_all" on public.employee_compensation;
create policy "comp_admin_all" on public.employee_compensation
  for all to authenticated
  using (public.admin_can_access_location(public.employee_location(employee_id)))
  with check (public.admin_can_access_location(public.employee_location(employee_id)));

-- monthly_sales (location via employee)
drop policy if exists "monthly_sales_admin_all" on public.monthly_sales;
create policy "monthly_sales_admin_all" on public.monthly_sales
  for all to authenticated
  using (public.admin_can_access_location(public.employee_location(employee_id)))
  with check (public.admin_can_access_location(public.employee_location(employee_id)));
