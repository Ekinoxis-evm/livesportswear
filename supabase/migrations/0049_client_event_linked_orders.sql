-- Let one sold walk-in link SEVERAL Shopify orders.
--
-- A client sometimes buys in more than one order on a single visit (two
-- receipts, a split payment, an item rung up after the first ticket). The
-- single `shopify_order_id/_name` + `order_total` columns could only hold one,
-- so the rest of the spend was invisible in the day report and the client's
-- linked total.
--
-- `linked_orders` holds the full set as a jsonb array — the same pattern
-- `client_events` already uses for `products` and `reasons`. The existing
-- single columns stay as the PRIMARY order (the first picked; it carries the
-- customer that drives attribution), so every current reader keeps working
-- unchanged. `order_total` is now the SUM across all linked orders.
--
-- Null/[]: old rows, and sales with no order linked at all (anonymous cash
-- walk-ins) — readers fall back to the single columns exactly as before.
alter table public.client_events
  add column if not exists linked_orders jsonb;

comment on column public.client_events.linked_orders is
  'All Shopify orders on this sale as [{id,name,total,customer_*}]. The single shopify_order_* columns mirror the FIRST (primary) order; order_total is the SUM. Null = old row or no order linked.';
