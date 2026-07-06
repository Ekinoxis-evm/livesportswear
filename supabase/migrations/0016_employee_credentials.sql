-- =============================================================================
-- 0016 — Stored temporary credentials (admin onboarding)
--
-- When an admin sets/generates a temporary password (or invites someone), the
-- password is kept here so the admin can retrieve it from the employee page
-- until the employee changes it — then the row is deleted. Deliberate plaintext
-- for a *temporary* credential; see security.md.
--
-- RLS: enabled with NO policies (default deny). Nobody reads this through the
-- RLS client — only admin-gated server code using the service role.
-- =============================================================================

create table if not exists public.employee_credentials (
  employee_id   uuid primary key references public.employees(id) on delete cascade,
  temp_password text not null,
  set_by        uuid,
  set_at        timestamptz not null default now()
);
alter table public.employee_credentials enable row level security;
