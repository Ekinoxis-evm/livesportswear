-- Staged Shopify corrections: build a reviewable draft (book qty vs fresh
-- Shopify on_hand per variant), review/exclude rows, then apply via
-- inventorySetOnHandQuantities. Only DIFFERENCES are stored as items;
-- in-sync/skipped tallies live on the header so the review page can show
-- corrections + in_sync + skipped = book_items. One 'draft' per location.

create table public.shopify_push_drafts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id),
  status text not null default 'draft' check (status in ('draft', 'applied', 'discarded')),
  shopify_location_id text not null,
  shopify_location_name text,
  created_by uuid,
  book_items int not null default 0,
  in_sync_items int not null default 0,
  skipped_unknown int not null default 0,
  skipped_no_variant int not null default 0,
  applied_at timestamptz,
  applied_by uuid,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index shopify_push_drafts_one_draft
  on public.shopify_push_drafts (location_id)
  where status = 'draft';

create trigger shopify_push_drafts_updated_at
  before update on public.shopify_push_drafts
  for each row execute function public.tg_set_updated_at();

alter table public.shopify_push_drafts enable row level security;

create policy "shopify_push_drafts_admin_all" on public.shopify_push_drafts
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));

create table public.shopify_push_draft_items (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.shopify_push_drafts(id) on delete cascade,
  barcode text not null,
  sku text,
  product_title text not null,
  variant_title text,
  inventory_item_id text not null,
  book_qty int not null check (book_qty >= 0),
  shopify_qty int not null,
  delta int not null,
  excluded boolean not null default false,
  apply_status text check (apply_status in ('written', 'failed')),
  apply_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, barcode)
);

create index shopify_push_draft_items_draft on public.shopify_push_draft_items (draft_id);

create trigger shopify_push_draft_items_updated_at
  before update on public.shopify_push_draft_items
  for each row execute function public.tg_set_updated_at();

alter table public.shopify_push_draft_items enable row level security;

create policy "shopify_push_draft_items_admin_all" on public.shopify_push_draft_items
  for all to authenticated
  using (exists (
    select 1 from public.shopify_push_drafts d
    where d.id = draft_id and public.admin_can_access_location(d.location_id)
  ))
  with check (exists (
    select 1 from public.shopify_push_drafts d
    where d.id = draft_id and public.admin_can_access_location(d.location_id)
  ));
