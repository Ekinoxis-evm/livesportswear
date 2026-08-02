-- =============================================================================
-- 0060 — Stored temporary credentials for ADMIN accounts
--
-- Admins have no employees row (auth user only), so they couldn't use
-- employee_credentials — meaning an admin's generated temp password was shown
-- once and lost. This mirrors employee_credentials keyed on the auth user id, so
-- a master admin can re-copy an admin's password (or reset it) from Settings.
-- Deliberate plaintext for a *temporary* handover credential; see security.md.
--
-- RLS: enabled with NO policies (default deny). Read/written only by the
-- master-gated server actions using the service role (src/server/admins.ts).
-- =============================================================================

create table if not exists public.admin_credentials (
  admin_user_id uuid primary key references auth.users(id) on delete cascade,
  temp_password text not null,
  set_by        uuid,
  set_at        timestamptz not null default now()
);
alter table public.admin_credentials enable row level security;
