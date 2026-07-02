-- =============================================================================
-- 0014 — Manual queue reorder ("make up next")
--
-- A shift lead can override the rotation order: bumping an employee puts them
-- at the front of the available line regardless of rotation_count (the most
-- recent bump wins). The bump clears when the employee takes a customer, so
-- normal fairness order resumes afterwards.
-- =============================================================================

alter table public.floor_checkins
  add column if not exists bumped_at timestamptz;
