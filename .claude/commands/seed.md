---
description: Seed the local Supabase with sample locations, employees, and shift templates.
---

Seed the local database with test data:

1. Verify the local stack is running: `pnpm supabase status`. If not, prompt the user to run `pnpm supabase start` and stop.
2. Apply migrations + seed in one shot: `pnpm supabase db reset --local -- --i-mean-it` (only if the user confirms — `db reset` without the flag is denied by `settings.json`). Reset re-applies `supabase/migrations/*` and then `supabase/seed.sql`.
3. `supabase/seed.sql` is the single source of seed data (SQL, not a script). It currently seeds:
   - Locations ("Lincoln Road" + "International Mall", both `America/New_York`)
   - Shift templates per location ("Morning 09:30–17:30", "Evening 14:30–22:30")
   - A handful of employees per location (store_manager / shift_lead / sales_rep mix)
   - No schedules/shifts — create a draft through the UI or extend `seed.sql` in the same PR as the schema change that needs it.
4. Print a summary (row counts per table) at the end via `psql`/`supabase db` query.

Never seed against a non-local Supabase project. Verify the URL starts with `http://127.0.0.1` before any writes.
