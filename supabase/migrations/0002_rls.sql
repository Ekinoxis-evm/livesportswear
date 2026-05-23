-- =============================================================================
-- 0002 — Row-Level Security policies
--
-- Default: deny. Admin (authenticated Supabase Auth users) gets full read+write
-- on every table. The service-role key (server-only) bypasses RLS.
-- =============================================================================

alter table public.locations          enable row level security;
alter table public.employees          enable row level security;
alter table public.shift_templates    enable row level security;
alter table public.schedules          enable row level security;
alter table public.shifts             enable row level security;
alter table public.time_off_requests  enable row level security;
alter table public.audit_log          enable row level security;

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------
create policy "admin_select_locations"
  on public.locations for select
  to authenticated using (true);

create policy "admin_write_locations"
  on public.locations for all
  to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- employees
-- -----------------------------------------------------------------------------
create policy "admin_select_employees"
  on public.employees for select
  to authenticated using (true);

create policy "admin_write_employees"
  on public.employees for all
  to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- shift_templates
-- -----------------------------------------------------------------------------
create policy "admin_select_templates"
  on public.shift_templates for select
  to authenticated using (true);

create policy "admin_write_templates"
  on public.shift_templates for all
  to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- schedules
-- -----------------------------------------------------------------------------
create policy "admin_select_schedules"
  on public.schedules for select
  to authenticated using (true);

create policy "admin_write_schedules"
  on public.schedules for all
  to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- shifts
-- -----------------------------------------------------------------------------
create policy "admin_select_shifts"
  on public.shifts for select
  to authenticated using (true);

create policy "admin_write_shifts"
  on public.shifts for all
  to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- time_off_requests
-- -----------------------------------------------------------------------------
create policy "admin_select_time_off"
  on public.time_off_requests for select
  to authenticated using (true);

create policy "admin_write_time_off"
  on public.time_off_requests for all
  to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- audit_log (admin reads only; writes happen via service role)
-- -----------------------------------------------------------------------------
create policy "admin_select_audit"
  on public.audit_log for select
  to authenticated using (true);

-- =============================================================================
-- NOTE: Public/anonymous routes (e.g. GET /s/{token}/calendar.ics) do NOT use
-- the anon key directly. Server code verifies the magic token, then uses the
-- service-role client to fetch shifts. This keeps RLS strict while allowing
-- the read.
-- =============================================================================
