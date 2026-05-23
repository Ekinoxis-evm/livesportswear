---
description: Scaffold a new feature module with a server action, a UI component, and a vitest test file.
argument-hint: "<feature-name-kebab>"
---

Scaffold a new feature called `$ARGUMENTS`.

1. Confirm `$ARGUMENTS` is kebab-case. If not, halt and ask.
2. Read `.claude/rules/code-style.md` and `.claude/rules/data-model.md` before generating code.
3. Create:
   - `src/server/$ARGUMENTS.ts` — server actions (Zod-validated inputs, supabase server client, return typed results).
   - `src/components/$ARGUMENTS/$ARGUMENTS-form.tsx` — client component using react-hook-form + zod resolver.
   - `tests/$ARGUMENTS.spec.ts` — vitest happy-path test for the server action (mocking supabase if needed).
4. If the feature touches the schedule grid, also add a unit test against `validateSchedule` covering any new constraint.
5. Run `pnpm typecheck` and `pnpm test`. If either fails, fix and re-run.
6. Print a one-line summary of files created.

Do not modify migrations from this command — use `/db-migrate` for that.
