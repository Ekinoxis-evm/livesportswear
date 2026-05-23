---
description: Seed the local Supabase with sample locations, employees, templates, and a draft schedule.
---

Seed the local database with test data:

1. Verify `supabase` CLI is logged in: `pnpm supabase status`. If not, prompt the user to run `pnpm supabase login` and stop.
2. Apply migrations to the local stack if not yet applied: `pnpm supabase db reset --local` (only if user confirms — the post-edit hook will block otherwise).
3. Run the seed script: `pnpm tsx scripts/seed.ts`. Create the script if it doesn't exist, using realistic Live Active Wear data:
   - 2 locations (different timezones: e.g. "Bogotá" America/Bogota, "Miami Brickell" America/New_York)
   - 8 employees per location, roles: 1 store_manager, 2 shift_lead, 5 sales_rep
   - 2 shift templates per location: "Morning 09:30–17:30", "Evening 14:30–22:30"
   - One draft schedule for next Monday with ~70% coverage assigned
4. Print a summary table (locations, counts) at the end.

Never seed against a non-local Supabase project. Verify the URL starts with `http://127.0.0.1` before any writes.
