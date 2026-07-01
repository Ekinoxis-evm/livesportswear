-- =============================================================================
-- 0012 — Per-store, per-month commission tiers
--
-- Commission tiers become variable per (location, year, month), alongside the
-- monthly sales goal already on store_goals. When a store/month has no tiers
-- set, commission falls back to the global commission_config.tiers.
--
-- tiers shape: [{ "min_sales": number, "rate": number }, ...] (same as global).
-- =============================================================================

alter table public.store_goals
  add column if not exists tiers jsonb;
