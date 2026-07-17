-- Net-sales decomposition alongside the stored net figures. Nullable: history
-- rows without a breakdown render as "—" until re-synced/backfilled.
-- gross − discounts − returns = net (amount / shopify_sales stay NET).

alter table public.monthly_sales
  add column if not exists gross_amount numeric(14,2),
  add column if not exists discounts_amount numeric(14,2),
  add column if not exists returns_amount numeric(14,2);

alter table public.store_day_closes
  add column if not exists gross_sales numeric(12,2),
  add column if not exists discounts numeric(12,2),
  add column if not exists returns_value numeric(12,2);
