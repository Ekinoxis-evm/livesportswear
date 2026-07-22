-- Supersedes 0046: one cross-tab instead of two flat groupings.
--
-- The country rollup on /admin/clients re-scopes when you filter to a rep, so
-- a flat "clients per country" can't answer it — you need the pair. Grouping by
-- (staff_id, country_iso) returns a couple of hundred rows at most and every
-- rollup the page needs is derivable from it: total, per rep, per country, and
-- per country for one rep.
drop function if exists public.client_origin_tallies();

create or replace function public.client_origin_tallies()
returns table (staff_id text, country_iso text, clients bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select staff_id, country_iso, count(*) as clients
  from public.customer_origin
  group by staff_id, country_iso;
$$;

-- security invoker: runs as the caller, so customer_origin's admin-only policy
-- supplies the scope. A scoped admin sees only their locations.
revoke execute on function public.client_origin_tallies() from public, anon;
grant execute on function public.client_origin_tallies() to authenticated, service_role;
