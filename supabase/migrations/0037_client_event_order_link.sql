-- A sold walk-in can link the real Shopify order and its customer — the
-- start of the client history (who bought, with which rep, who left
-- contact). Permissive on purpose (0021 posture): Zod in
-- src/server/store-floor.ts is the enforcement point. Customer contact is
-- business data under the existing RLS (admin-all + rep's own rows,
-- service-role writes); it must never appear in logs (see security.md).

alter table public.client_events
  add column shopify_order_id text,
  add column shopify_order_name text,
  add column order_total numeric(12,2),
  add column shopify_customer_id text,
  add column customer_name text,
  add column customer_email text,
  add column customer_phone text;

create index client_events_customer on public.client_events (location_id, shopify_customer_id)
  where shopify_customer_id is not null;
