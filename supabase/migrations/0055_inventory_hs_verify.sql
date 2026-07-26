-- New-arrivals matrix: capture the HS (harmonized-system) code the supplier
-- document prints per reference, and let a rep tick each reference "verified"
-- after physically confirming its units. Both are receiving-only: counts leave
-- hs_code null and verified false (a blind scan has no document to verify
-- against). No RLS change — inventory_count_items stays admin-only via its
-- parent count (admin_can_access_location); the kiosk never touches it.
alter table public.inventory_count_items
  add column if not exists hs_code text,
  add column if not exists verified boolean not null default false;

comment on column public.inventory_count_items.hs_code is
  'Harmonized-system tariff code as printed on the arrival document (receiving only; null for counts).';
comment on column public.inventory_count_items.verified is
  'Receiving: a rep confirmed this line''s physical units against the document. False for counts.';
