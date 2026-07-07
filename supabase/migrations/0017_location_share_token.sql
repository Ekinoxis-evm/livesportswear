-- =============================================================================
-- 0017 — Store-week share token
--
-- Capability URL for the whole store's published week (/w/{token}/{week}) —
-- everyone's shifts, read-only, no login. Same model as employee magic tokens:
-- 32 random bytes, unguessable, never logged, 404 on miss.
-- =============================================================================

alter table public.locations
  add column if not exists share_token text unique;

update public.locations
set share_token = translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_')
where share_token is null;
