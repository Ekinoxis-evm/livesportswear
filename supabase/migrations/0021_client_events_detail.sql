-- Richer client events: no-sale reasons (mandatory in the app layer),
-- optional product tags from Shopify search, an optional note, and a `kind`
-- separating returns/exchanges from walk-ins. Returns get their own counters
-- and never touch the walk-in conversion rate (src/lib/conversion.ts).
-- The DB stays permissive on purpose — Zod in src/server/store-floor.ts is
-- the enforcement point while the owner refines the flow.
alter table public.client_events
  add column if not exists kind text not null default 'walkin'
    check (kind in ('walkin', 'return')),
  add column if not exists reasons text[],
  add column if not exists note text,
  add column if not exists products jsonb;
