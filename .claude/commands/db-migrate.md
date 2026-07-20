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
4. If types are affected, regenerate types: `pnpm supabase gen types typescript --linked > src/lib/supabase/types.ts`. When the MCP/CLI can't reach the DB, hand-edit `src/lib/supabase/types.ts` to add the new columns/tables so the build stays green until a real regen.
5. Print the file path + a one-line rollback note in the assistant response.

## Applying a migration to prod (IMPORTANT — this repo is not CLI-managed)

**`supabase db push` does NOT work here.** The remote migration history uses
timestamp IDs (e.g. `20260702045520`) while these files are numbered
`0001..NNNN`; the CLI can't reconcile the two and refuses. Migrations are applied
as **direct SQL via the Supabase Management API query endpoint**:

```
REF=mkyybltpxyerlujdpbjd   # livesportwear (the linked prod project)
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
jq -Rs '{query:.}' < supabase/migrations/NNNN_name.sql \
  | curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
      -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @-
```

A successful apply returns `[]`. The Supabase MCP is read-only and the auto-mode
classifier blocks self-applied DB writes, so this needs the operator to approve
the tool call (or run it themselves). Never log the token.

Never write destructive DDL (`DROP`, `ALTER ... DROP COLUMN`) without an explicit prompt from the user.
