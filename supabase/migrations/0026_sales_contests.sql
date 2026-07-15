-- Sales contests (rewards): per-location contests over an arbitrary date
-- range. The store threshold is a GATE — if the location's attributed sales
-- over the period stay below it, nobody wins. Ranked place prizes live in
-- `prizes` jsonb; `results` is the immutable final snapshot written once after
-- end_date passes (daily cron, with an admin-view fallback). Standings math is
-- pure in src/lib/rewards.ts; sales come live from Shopify per range.
create table if not exists public.sales_contests (
  id              uuid primary key default gen_random_uuid(),
  location_id     uuid not null references public.locations(id) on delete cascade,
  name            text not null,
  start_date      date not null,
  end_date        date not null,
  store_threshold numeric(14,2) not null default 0,
  -- ascending places: [{"place":1,"prize":"...","min_sales":123|null}, ...]
  prizes          jsonb not null default '[]'::jsonb,
  -- {finalized_on, store_total, gate_passed,
  --  standings:[{employee_id,name,amount,place,prize|null,won}]}
  results         jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists sales_contests_loc_dates_idx
  on public.sales_contests (location_id, end_date, start_date);

create trigger sales_contests_updated_at
  before update on public.sales_contests
  for each row execute function public.tg_set_updated_at();

alter table public.sales_contests enable row level security;

-- Same posture as store_goals (0009): scoped admins manage their locations;
-- employees read their own location's contests (portal progress page). The
-- kiosk reads via the service client (requireStore), so no store-JWT policy.
create policy "sales_contests_admin_all" on public.sales_contests
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));

create policy "sales_contests_location_read" on public.sales_contests
  for select to authenticated
  using (location_id = public.current_location_id());
