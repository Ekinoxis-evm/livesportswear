-- =============================================================================
-- 0004 — Commission config + monthly sales
--
-- A single global commission config (tiered rates) and a per-employee monthly
-- sales figure. Sales are entered manually now and will be written by the
-- Shopify sync later (same table, distinguished by `source`).
-- =============================================================================

-- Global, single-row config. Tiers: ascending [{min_sales, rate}], rate as a
-- fraction (0.04 = 4%). Base tier has min_sales 0.
create table if not exists public.commission_config (
  id          int primary key default 1 check (id = 1),
  currency    text not null default 'COP',
  tiers       jsonb not null default
    '[{"min_sales":0,"rate":0.04},{"min_sales":20000000,"rate":0.045},{"min_sales":35000000,"rate":0.06}]'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.commission_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.monthly_sales (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  month        text not null check (month ~ '^\d{4}-\d{2}$'),  -- YYYY-MM, location-local
  amount       numeric(14,2) not null default 0,
  source       text not null default 'manual',                 -- manual | shopify
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, month)
);
create index monthly_sales_month_idx on public.monthly_sales (month);

alter table public.commission_config enable row level security;
alter table public.monthly_sales enable row level security;

create trigger commission_config_updated_at
  before update on public.commission_config
  for each row execute function public.tg_set_updated_at();
create trigger monthly_sales_updated_at
  before update on public.monthly_sales
  for each row execute function public.tg_set_updated_at();

-- commission_config: any authenticated user may read (employees see their rate);
-- only admins write.
create policy "commission_config_read" on public.commission_config
  for select to authenticated using (true);
create policy "commission_config_admin_write" on public.commission_config
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- monthly_sales: admin full; employee reads only their own.
create policy "monthly_sales_admin_all" on public.monthly_sales
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "monthly_sales_self_read" on public.monthly_sales
  for select to authenticated using (employee_id = public.current_employee_id());
