-- The editable recipient list for a store's daily Close-Day report.
--
-- Until now the report went only to admin auth users (reportRecipients() in
-- src/server/conversion-core.ts). Admins want to edit that list freely — add
-- outside addresses (owner, accountant) and remove any recipient. This table is
-- the source of truth; it's seeded below with each location's current admin
-- emails so the list starts populated and every existing store keeps working.
create table if not exists public.store_report_recipients (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  email       text not null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- Case-insensitive dedup per location (expression → separate unique index).
create unique index if not exists store_report_recipients_loc_email_key
  on public.store_report_recipients (location_id, lower(email));

create index if not exists store_report_recipients_location_idx
  on public.store_report_recipients (location_id);

alter table public.store_report_recipients enable row level security;

-- Admin-only, location-scoped (mirrors store_goals / employee_goals).
create policy "store_report_recipients_admin_all" on public.store_report_recipients
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));

-- Seed each location with the admins who currently receive its report — master
-- admins everywhere, location-scoped admins only for their mapped locations
-- (the same rule adminReportEmails() applies). One-time; new admins added later
-- won't auto-appear (the list is now the source of truth).
insert into public.store_report_recipients (location_id, email)
select l.id, lower(u.email)
from public.locations l
join auth.users u on true
where coalesce(u.raw_app_meta_data ->> 'role', '') = 'admin'
  and u.email is not null
  and (
    coalesce(u.raw_app_meta_data ->> 'admin_scope', 'master') <> 'location'
    or exists (
      select 1 from public.admin_locations al
      where al.admin_user_id = u.id and al.location_id = l.id
    )
  )
on conflict (location_id, lower(email)) do nothing;
