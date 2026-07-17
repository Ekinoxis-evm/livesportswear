-- The store's own inventory book: one row per (location, barcode), holding
-- OUR counted truth. Written by finalizeCount (a finalized total count
-- replaces the book); shopify_qty keeps what Shopify believed at count time
-- so drift stays visible. Pushing corrections back to Shopify is a later
-- phase (the app token lacks write_inventory today).

create table public.store_inventory (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  barcode text not null,
  sku text,
  product_title text not null,
  variant_title text,
  qty int not null default 0 check (qty >= 0),
  shopify_qty int,
  unknown boolean not null default false,
  counted_at timestamptz not null default now(),
  count_id uuid references public.inventory_counts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, barcode)
);

create index store_inventory_location on public.store_inventory (location_id);

create trigger store_inventory_updated_at
  before update on public.store_inventory
  for each row execute function public.tg_set_updated_at();

alter table public.store_inventory enable row level security;

create policy "store_inventory_admin_all" on public.store_inventory
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));
