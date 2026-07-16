-- Security hardening (Supabase advisor findings, all pre-existing):
--
-- 1. Pin search_path on the three functions that lacked one (mutable
--    search_path lets a role with schema-create rights shadow objects).
-- 2. The RLS helper functions are SECURITY DEFINER and were executable by
--    anon via PostgREST /rpc. Every policy in this schema targets
--    `authenticated` (verified in pg_policies), so anon never needs them:
--    revoke PUBLIC/anon, grant authenticated + service_role explicitly.
-- 3. Drop the avatars listing policy: the bucket is public, so object URLs
--    work without any SELECT policy; the policy only allowed LISTING every
--    file. The app never lists (uploads + getPublicUrl via service role).
alter function public.tg_set_updated_at() set search_path = public;
alter function public.is_admin() set search_path = public;
alter function public.is_master_admin() set search_path = public;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.is_admin()',
    'public.is_master_admin()',
    'public.admin_can_access_location(uuid)',
    'public.current_employee_id()',
    'public.current_location_id()',
    'public.employee_location(uuid)',
    'public.schedule_location(uuid)',
    'public.rls_auto_enable()'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;

drop policy if exists "avatars_public_read" on storage.objects;
