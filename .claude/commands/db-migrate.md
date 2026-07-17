---
description: Create a new Supabase migration with RLS guidance and audit-log reminder.
argument-hint: "<short_snake_case_name>"
---

Create a new Supabase migration named `$ARGUMENTS`.

1. Inspect `supabase/migrations/` and pick the next numeric prefix (append-only; the sequence is at `0030_`, so the next is `0031_`… check, don't assume).
2. Read `.claude/rules/data-model.md` to confirm the schema decision is documented; if not, add it there first.
3. Create `supabase/migrations/{NNNN}_$ARGUMENTS.sql` with:
   - The DDL change
   - Indexes for any new FK or commonly-filtered columns
   - RLS policy adjustments (every new table MUST have RLS enabled + a default deny)
   - If the table is admin-mutated, remind the server action to insert an `audit_log` row (auditing is application-level — there are no DB triggers for it)
4. If types are affected, regenerate types: `pnpm supabase gen types typescript --linked > src/lib/supabase/types.ts`
5. Print the file path + a one-line rollback note in the assistant response. Do not run `supabase db push` from this command — leave that to the operator.

Never write destructive DDL (`DROP`, `ALTER ... DROP COLUMN`) without an explicit prompt from the user.
