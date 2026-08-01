-- Shopify-exact sales reporting: monthly_sales carries the tax total so the
-- Month + all-time views can show Taxes and Total sales (Total = amount + tax),
-- matching Shopify Analytics. `amount` stays NET (the metric for goals/
-- commission/contests); this is reporting only.
--
-- Backfilled by a full re-sync (`runShopifySync`); null for months synced before
-- 0059, where the Total-sales figure falls back to Net until they're re-synced.

alter table public.monthly_sales
  add column if not exists tax_amount numeric(14,2);
