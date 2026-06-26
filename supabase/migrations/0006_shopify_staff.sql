-- =============================================================================
-- 0006 — Map employees to their Shopify POS staff member
--
-- Sales sync attributes each order to its Order.staffMember; we link that
-- Shopify StaffMember GID to an employee here.
-- =============================================================================
alter table public.employees
  add column if not exists shopify_staff_id text;
create index if not exists employees_shopify_staff_idx
  on public.employees (shopify_staff_id);
