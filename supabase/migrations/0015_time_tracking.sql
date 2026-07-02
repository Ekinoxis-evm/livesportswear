-- =============================================================================
-- 0015 — Validated entry/exit (peer attestation) + worked-hours tracking
--
-- Arrival/departure stay self-reported taps, but each can now be attested by a
-- coworker who is physically in the store: the employee's card shows a QR with
-- a one-time link; any active coworker opens it and confirms. First-in / last-
-- out have nobody to attest, so they self-validate flagged (entry_self /
-- exit_self). Validation never blocks the floor queue — it only marks how the
-- hours read in the admin report.
--
--   floor_checkins.*_validated_at/by — the attestation stamps
--   attendance_validations           — one-time QR tokens (audit trail)
-- =============================================================================

alter table public.floor_checkins
  add column if not exists entry_validated_at timestamptz,
  add column if not exists entry_validated_by uuid references public.employees(id) on delete set null,
  add column if not exists exit_validated_at timestamptz,
  add column if not exists exit_validated_by uuid references public.employees(id) on delete set null,
  add column if not exists entry_self boolean not null default false,
  add column if not exists exit_self boolean not null default false;

create table if not exists public.attendance_validations (
  id           uuid primary key default gen_random_uuid(),
  checkin_id   uuid not null references public.floor_checkins(id) on delete cascade,
  kind         text not null check (kind in ('entry', 'exit')),
  token        text not null unique,
  created_at   timestamptz not null default now(),
  used_at      timestamptz,
  validated_by uuid references public.employees(id) on delete set null,
  unique (checkin_id, kind)
);
alter table public.attendance_validations enable row level security;

-- Reads are location-scoped (same shared shop-floor model as floor_checkins);
-- all writes go through server actions using the service client.
create policy "attendance_validations_admin_read" on public.attendance_validations
  for select to authenticated
  using (exists (
    select 1 from public.floor_checkins c
    where c.id = checkin_id
      and public.admin_can_access_location(c.location_id)
  ));
create policy "attendance_validations_location_read" on public.attendance_validations
  for select to authenticated
  using (exists (
    select 1 from public.floor_checkins c
    where c.id = checkin_id
      and c.location_id = public.current_location_id()
  ));
