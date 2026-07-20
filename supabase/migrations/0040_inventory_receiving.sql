-- "New Stock" (receiving) inventory mode.
--
-- Counting (the existing flow) REPLACES Shopify's on-hand with what was scanned.
-- Receiving is the opposite: a restock shipment arrives with a supplier document
-- (CSV/Excel or a PDF/photo invoice), the line items are extracted, matched to
-- Shopify, physically verified, and then ADDED to current stock
-- (new on-hand = current + arrived). A receiving session reuses inventory_counts /
-- inventory_count_items; `kind` tells the two modes apart.

alter table public.inventory_counts
  add column if not exists kind text not null default 'count'
    check (kind in ('count', 'restock')),
  add column if not exists document_path text; -- uploaded arrival doc (restock only)

-- Allow one open Counting AND one open New Stock session per location at once.
drop index if exists public.inventory_counts_one_open;
create unique index inventory_counts_one_open
  on public.inventory_counts (location_id, kind)
  where status = 'open';

-- restock only: the quantity the document stated arrived (paper's claim).
-- `expected` = current Shopify on-hand at match time; `qty` = physically verified
-- arrived. New on-hand at receive = fresh onHand + qty.
alter table public.inventory_count_items
  add column if not exists doc_qty int;

-- Private bucket for uploaded arrival documents; read/written only via the
-- service client in the receiving server actions (mirrors checkin-photos).
insert into storage.buckets (id, name, public)
values ('receiving-docs', 'receiving-docs', false)
on conflict (id) do nothing;
