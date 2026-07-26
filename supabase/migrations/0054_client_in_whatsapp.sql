-- A per-client "already saved in the store's WhatsApp" flag, set by reps on the
-- kiosk clients page. A non-PII boolean, so it stays inside customer_origin's
-- aggregate/derived rule (like country_iso). No new RLS: the kiosk writes it via
-- a service-client action scoped by the JWT location_id (the established single-
-- writer pattern); admins write via the existing customer_origin_admin_all policy.
alter table public.customer_origin
  add column if not exists in_whatsapp boolean not null default false;

comment on column public.customer_origin.in_whatsapp is
  'Store-set: the rep saved this client''s number in the store WhatsApp. Manual, kiosk-editable.';
