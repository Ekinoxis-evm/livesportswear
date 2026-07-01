-- =============================================================================
-- 0013 — Structured location address
--
-- `address` stays as the street line; add city / state / country / postal_code
-- so a location carries a full, structured address alongside its timezone (the
-- authoritative reference for all store-local date/time math).
-- =============================================================================

alter table public.locations
  add column if not exists city        text,
  add column if not exists state       text,
  add column if not exists country     text,
  add column if not exists postal_code text;
