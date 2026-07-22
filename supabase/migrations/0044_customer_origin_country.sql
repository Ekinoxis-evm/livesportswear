-- Store each client's country so the rollup can count the whole book.
--
-- The admin Clients page derived country from the phone of whichever 50 rows
-- were on screen, then displayed the tally next to a total of 5,956. Too few
-- countries, and the per-country counts never summed to the total — it read as
-- broken because it was. Deriving per page can't be fixed by better maths; the
-- value has to be stored once.
--
-- A 2-letter country code is NOT contact data, so this stays inside the rule
-- 0042 set for this table: no name, no email, no phone, no client identity.
-- The country is a derived, aggregate-level attribute — a deliberate, narrow
-- exception rather than a crack in that rule.
--
-- NULL means unknown, and that bucket is expected to be large: of a
-- 250-customer sample only 72% had a phone at all. Every phone that exists
-- resolves; the rest simply have nothing to resolve from.
alter table public.customer_origin
  add column if not exists country_iso text;

comment on column public.customer_origin.country_iso is
  'ISO 3166-1 alpha-2 derived from the customer''s phone country indicator (lib/phone-country.ts). NULL = no phone on file, or a number libphonenumber cannot place.';

-- Powers the "where these clients are from" rollup, scoped per store.
create index if not exists customer_origin_country_idx
  on public.customer_origin (location_id, country_iso);
