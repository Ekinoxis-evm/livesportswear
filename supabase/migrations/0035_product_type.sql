-- Product category (Shopify productType, e.g. LEGGING / SPORTS BRA / BIKINI)
-- captured at scan/finalize so counts and the book can group by clothing
-- type. Null on rows created before this migration; the book heals on the
-- next full count (finalize replaces it).

alter table public.inventory_count_items add column product_type text;
alter table public.store_inventory add column product_type text;
