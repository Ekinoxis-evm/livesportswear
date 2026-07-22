-- Count clients in the database, not in the page.
--
-- /admin/clients builds two whole-book rollups: clients per rep, and clients
-- per country. Both were computed by pulling EVERY customer_origin row into the
-- server component and counting in JS. At ~6,000 clients that meant six
-- paginated round trips plus the array work on every page load, and the page
-- stopped responding — worst on a slow connection or an iPad.
--
-- Counting is what Postgres is for. Two grouped queries return ~7 and ~30 rows
-- instead of 6,000, and stay flat as the book grows.
create or replace function public.client_origin_tallies(loc uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.customer_origin where location_id = loc),
    'by_staff', coalesce((
      select jsonb_agg(jsonb_build_object('staff_id', staff_id, 'clients', n))
      from (
        select staff_id, count(*) as n
        from public.customer_origin
        where location_id = loc
        group by staff_id
      ) s
    ), '[]'::jsonb),
    'by_country', coalesce((
      select jsonb_agg(jsonb_build_object('country_iso', country_iso, 'clients', n))
      from (
        select country_iso, count(*) as n
        from public.customer_origin
        where location_id = loc
        group by country_iso
      ) c
    ), '[]'::jsonb)
  );
$$;

-- `security invoker` on purpose: the function runs as the caller, so the
-- admin-only RLS policy on customer_origin still applies. A non-admin calling
-- this sees zeros rather than the store's numbers.
revoke execute on function public.client_origin_tallies(uuid) from public, anon;
grant execute on function public.client_origin_tallies(uuid) to authenticated, service_role;
