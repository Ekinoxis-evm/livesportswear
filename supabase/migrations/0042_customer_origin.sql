-- Which rep brought each client in.
--
-- Shopify is the client book (6,396 customers at time of writing); our DB knew
-- 11 of them, because a customer only landed here when a rep happened to link
-- the order at the kiosk. Kiosk discipline can never close that gap — it only
-- sees sales made since the kiosk shipped. The order history can: every Shopify
-- order carries `user_id` (the POS staff who rang it), so a customer's FIRST POS
-- order names the rep who brought them in, back to 2024.
--
-- This table holds attribution and nothing else. No name, email or phone —
-- Shopify owns client identity, contact and search; duplicating it here would
-- both fight the source of truth and create a new PII surface.
--
-- `staff_id` is stored rather than a resolved employee_id ON PURPOSE: the order
-- history contains staff who have since left, and reps get mapped to their
-- Shopify staff account after the fact. Resolving at read time (join
-- employees.shopify_staff_id) means mapping a staff id later re-attributes all
-- history automatically, with no re-backfill.
create table if not exists public.customer_origin (
  shopify_customer_id text primary key,
  location_id         uuid not null references public.locations(id) on delete cascade,
  first_order_id      text not null,
  first_order_name    text,
  first_order_at      timestamptz not null,
  staff_id            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists customer_origin_location_first_order_idx
  on public.customer_origin (location_id, first_order_at desc);

create index if not exists customer_origin_staff_idx
  on public.customer_origin (staff_id);

create trigger customer_origin_updated_at
  before update on public.customer_origin
  for each row execute function public.tg_set_updated_at();

alter table public.customer_origin enable row level security;

-- Admin-only, location-scoped (mirrors store_report_recipients / store_goals).
-- No employee or kiosk policy: the portal computes its own client numbers live
-- from Shopify, so nothing outside admin needs to read this.
create policy "customer_origin_admin_all" on public.customer_origin
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));

-- Bulk upsert that NEVER loses an earlier first order.
--
-- The incremental cron pass only looks at the last couple of days, so without
-- this guard it would happily overwrite a client's real 2024 first order (and
-- the rep who earned it) with whichever order it happened to see today. The
-- `where` clause on the conflict makes a later order a no-op.
create or replace function public.upsert_customer_origin(rows jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.customer_origin as co (
    shopify_customer_id, location_id, first_order_id,
    first_order_name, first_order_at, staff_id
  )
  select
    r ->> 'shopify_customer_id',
    (r ->> 'location_id')::uuid,
    r ->> 'first_order_id',
    r ->> 'first_order_name',
    (r ->> 'first_order_at')::timestamptz,
    r ->> 'staff_id'
  from jsonb_array_elements(rows) as r
  on conflict (shopify_customer_id) do update set
    first_order_id   = excluded.first_order_id,
    first_order_name = excluded.first_order_name,
    first_order_at   = excluded.first_order_at,
    staff_id         = excluded.staff_id,
    location_id      = excluded.location_id
  where excluded.first_order_at < co.first_order_at;
$$;

-- Same posture as the 0028 hardening: not callable by anon/public.
revoke execute on function public.upsert_customer_origin(jsonb) from public, anon;
grant execute on function public.upsert_customer_origin(jsonb) to service_role;
