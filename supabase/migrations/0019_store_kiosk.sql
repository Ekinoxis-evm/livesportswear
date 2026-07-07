-- Kiosk PIN for the shared store screen: 4-digit PIN (hashed) confirming an
-- employee's identity on entry/exit taps. Written only via service-client
-- server actions; no RLS change (employees already read their own row).
alter table public.employees add column if not exists kiosk_pin_hash text;
