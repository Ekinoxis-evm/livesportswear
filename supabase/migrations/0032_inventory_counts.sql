-- Physical inventory counts (admin-only): scan barcodes on the floor, tally
-- per variant, and compare against Shopify's expected stock at finalize.
-- One OPEN count per location at a time; finalized counts are immutable records.

create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  status text not null default 'open' check (status in ('open', 'final')),
  note text,
  started_by uuid, -- admin auth user id
  started_at timestamptz not null default now(),
  finalized_at timestamptz,
  expected_units int,
  counted_units int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index inventory_counts_one_open
  on public.inventory_counts (location_id)
  where status = 'open';

create trigger inventory_counts_updated_at
  before update on public.inventory_counts
  for each row execute function public.tg_set_updated_at();

alter table public.inventory_counts enable row level security;

create policy "inventory_counts_admin_all" on public.inventory_counts
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));

create table public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  count_id uuid not null references public.inventory_counts(id) on delete cascade,
  barcode text not null,
  sku text,
  product_title text not null,
  variant_title text,
  qty int not null default 0 check (qty >= 0),
  expected int, -- Shopify inventoryQuantity snapshot; null for unknown barcodes
  unknown boolean not null default false, -- barcode not found in the catalog
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (count_id, barcode)
);

create index inventory_count_items_count on public.inventory_count_items (count_id);

create trigger inventory_count_items_updated_at
  before update on public.inventory_count_items
  for each row execute function public.tg_set_updated_at();

alter table public.inventory_count_items enable row level security;

create policy "inventory_count_items_admin_all" on public.inventory_count_items
  for all to authenticated
  using (exists (
    select 1 from public.inventory_counts c
    where c.id = count_id and public.admin_can_access_location(c.location_id)
  ))
  with check (exists (
    select 1 from public.inventory_counts c
    where c.id = count_id and public.admin_can_access_location(c.location_id)
  ));
