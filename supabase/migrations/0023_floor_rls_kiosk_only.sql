-- The store kiosk (service-role server actions, PIN-gated) has been the ONLY
-- floor write surface since 0019 — but the employee-JWT write policies from
-- 0011/0009 were never dropped. Any portal login could PATCH floor_checkins
-- rows at their location directly via PostgREST: forge validated entry/exit
-- stamps (hours = payroll money), reset rotation_count/attending counters,
-- or insert a check-in for an absent coworker. Reads stay (shared shop-floor
-- data + own conversion history); every write now requires the service role.

drop policy if exists "floor_checkins_location_insert" on public.floor_checkins;
drop policy if exists "floor_checkins_location_update" on public.floor_checkins;
drop policy if exists "floor_days_location_insert" on public.floor_days;
drop policy if exists "client_events_self_insert" on public.client_events;
drop policy if exists "client_events_self_update" on public.client_events;
