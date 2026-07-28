-- Kiosk counting step for New Stock (receiving).
--
-- Until now receiving was admin-only end to end: the admin uploaded the arrival
-- document, matched it to Shopify, ticked each reference to accept the document
-- quantities, and pushed. Now the physical count is done on the store iPad by the
-- employees who open the box, and the admin only ingests and pushes.
--
-- Lifecycle (restock only): open (admin uploads + matches) → counting (handed to
-- the kiosk; employees enter the counted quantity per reference/size) → ready
-- (kiosk finished) → final (admin reviewed + pushed to Shopify). Reuses the
-- existing item columns: doc_qty = the document's claim, qty = kiosk-counted
-- arrived, verified = "this reference was counted on the kiosk".

alter table public.inventory_counts
  drop constraint if exists inventory_counts_status_check;
alter table public.inventory_counts
  add constraint inventory_counts_status_check
  check (status in ('open', 'counting', 'ready', 'final'));

-- One ACTIVE session per (location, kind) — a session in counting/ready still
-- blocks a new upload, so the widened predicate is "anything not finalized".
drop index if exists public.inventory_counts_one_open;
create unique index inventory_counts_one_open
  on public.inventory_counts (location_id, kind)
  where status <> 'final';
