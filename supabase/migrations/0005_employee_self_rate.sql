-- =============================================================================
-- 0005 — Let employees read their own hourly rate
--
-- Adds a self-read policy on employee_compensation (admin write still admin-only
-- via comp_admin_all from 0003). Employees see only their own row.
-- =============================================================================
create policy "comp_self_read" on public.employee_compensation
  for select to authenticated using (employee_id = public.current_employee_id());
