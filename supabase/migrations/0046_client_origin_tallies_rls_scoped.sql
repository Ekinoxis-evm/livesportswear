-- Correct 0045: drop the location argument and let RLS do the scoping.
--
-- /admin/clients has no location filter — it shows every client the signed-in
-- admin can reach, which for a scoped admin is their mapped locations and for a
-- master admin is all of them. Taking `loc uuid` forced the caller to pick ONE
-- location and would have silently hidden a multi-location admin's other stores.
--
-- `security invoker` means the function runs as the caller, so the admin-only
-- policy on customer_origin already produces exactly the right scope. Passing a
-- location was both redundant and wrong.
drop function if exists public.client_origin_tallies(uuid);

create or replace function public.client_origin_tallies()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.customer_origin),
    'by_staff', coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', staff_id, 'clients', n))
      from (
        select staff_id, count(*) as n from public.customer_origin group by staff_id
      ) s
    ), '[]'::jsonb),
    'by_country', coalesce((
      select jsonb_agg(jsonb_build_object('country_iso', country_iso, 'clients', n))
      from (
        select country_iso, count(*) as n from public.customer_origin group by country_iso
      ) c
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.client_origin_tallies() from public, anon;
grant execute on function public.client_origin_tallies() to authenticated, service_role;
