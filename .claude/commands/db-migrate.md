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

## Applying a migration to prod — use the script, never a hand-written curl

**`supabase db push` does NOT work here.** The remote history uses timestamp IDs
(e.g. `20260702045520`) while these files are numbered `0001..NNNN`; the CLI
can't reconcile the two and refuses.

**Always use `.claude/scripts/db-apply.sh`:**

```
.claude/scripts/db-apply.sh 0048_floor_day_closed    # apply by name
.claude/scripts/db-apply.sh --check                  # applied vs. on disk
.claude/scripts/db-apply.sh --record 00NN_name       # mark an already-applied one
```

It exists because four things went wrong with inline curls, all of them real:

1. **The file usually isn't on your branch.** A migration is written on a feature
   branch and must be applied *before* that branch merges (ordering below). The
   script finds the branch holding it; a plain `< supabase/migrations/…`
   redirect simply fails on `main`.
2. **No permission rule matched an inline curl**, so it was approved or blocked
   unpredictably mid-task. One script = one auditable rule
   (`Bash(./.claude/scripts/db-apply.sh:*)` in `.claude/settings.local.json`).
3. **The ledger drifted.** API-applied migrations don't write a
   `schema_migrations` row — it read 0038 while the schema was really at 0044,
   so nothing could be trusted to say what was applied. The script records it.
4. It never echoes the token.

### Order of operations — this matters

**Apply the migration BEFORE merging the PR.** If code that reads a new column
deploys first, every request to that page throws until the column exists. (A new
RLS policy is gentler — without it RLS returns nothing, so the feature looks
empty rather than broken — but it's still wrong.)

```
1. .claude/scripts/db-apply.sh <NNNN_name>   → "applied" + ledger row
2. .claude/scripts/db-apply.sh --check       → confirm it's listed
3. gh pr merge <n> --rebase --delete-branch
4. verify the deploy, then run any backfill the feature needs
```

### The ledger is not a reliable index

Names are stored in three formats: early CLI migrations have no numeric prefix
(`initial`, `floor_queue`), later ones do (`0031_sales_breakdown`). Comparing
filenames to ledger names produces false "NOT APPLIED" results. **The schema is
the truth** — check whether the object exists before concluding anything.

### MCP auth (why the Supabase MCP says "Unauthorized")

`.mcp.json` interpolates `${SUPABASE_ACCESS_TOKEN}` / `${SUPABASE_PROJECT_REF}`
from the **launching shell**, not `.env.local`. If they aren't exported before
`claude` starts, the MCP fails to authenticate for the whole session and every
lookup falls back to raw curl. The server is also `--read-only`, so it can never
apply a migration — that is always this script's job.

Never write destructive DDL (`DROP`, `ALTER ... DROP COLUMN`) without an explicit prompt from the user.
