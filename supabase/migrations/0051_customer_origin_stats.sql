-- Cache each client's Shopify stats on customer_origin so the client lists can
-- SORT + paginate by them in the DB.
--
-- Until now name / orders / total-spent were fetched from Shopify per visible
-- page (always fresh, but un-sortable — the DB never saw them). The admin and
-- portal client books want click-to-sort by spend/orders/name, which needs the
-- sort keys in Postgres. So we cache them here, refreshed by the sync
-- (customer-origin-sync.ts). Trade-off: these figures now LAG Shopify between
-- syncs. Contact (email/phone) is deliberately NOT cached — still fetched live,
-- per page, only for the contact buttons; Shopify stays the owner of identity.
alter table public.customer_origin
  add column if not exists customer_name text,
  add column if not exists orders_count int,
  add column if not exists total_spent numeric(14,2),
  add column if not exists stats_synced_at timestamptz;

comment on column public.customer_origin.total_spent is
  'Cached Shopify lifetime spend for sorting/pagination; refreshed by runCustomerStatsSync. Lags Shopify between syncs. NOT the source of truth.';

-- Sort paths the pages offer (one location today, but keep the prefix for parity
-- with the other customer_origin indexes). Nulls (un-synced) sort last.
create index if not exists customer_origin_spent_idx
  on public.customer_origin (location_id, total_spent desc nulls last);
create index if not exists customer_origin_orders_idx
  on public.customer_origin (location_id, orders_count desc nulls last);
create index if not exists customer_origin_name_idx
  on public.customer_origin (location_id, lower(customer_name));

-- Bulk-update stats by customer id in one statement per chunk (mirrors
-- upsert_customer_origin's posture: service-role only, never anon/public).
create or replace function public.update_customer_stats(rows jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.customer_origin as co set
    customer_name   = r.customer_name,
    orders_count    = r.orders_count,
    total_spent     = r.total_spent,
    stats_synced_at = now()
  from jsonb_to_recordset(rows) as r(
    shopify_customer_id text,
    customer_name text,
    orders_count int,
    total_spent numeric
  )
  where co.shopify_customer_id = r.shopify_customer_id;
$$;

revoke execute on function public.update_customer_stats(jsonb) from public, anon;
grant execute on function public.update_customer_stats(jsonb) to service_role;
