---
description: Add a new Violation rule to the scheduling engine, with a test and CLAUDE.md update.
argument-hint: "<RULE_CODE> <level: block|warn> <short description>"
---

Add a new scheduling rule. Argument format: `<RULE_CODE> <level> <description>` — e.g. `NO_DOUBLE_SHIFT block prevents two shifts in a 24h window`.

1. Read `src/lib/scheduling/rules.ts` and `tests/rules.spec.ts` first.
2. Update the `Violation['code']` union in `src/types/domain.ts` (or equivalent) to include the new code.
3. Add a pure function in `src/lib/scheduling/rules.ts` that returns `Violation[]` for the new rule. Compose it into `validateSchedule`.
4. Add at least three tests in `tests/rules.spec.ts`: one happy path, one violation, one boundary case.
5. If the rule is `block`, ensure `publishSchedule` blocks; if `warn`, ensure it surfaces in the UI but does not block.
6. Update `.claude/rules/data-model.md` with one line documenting the rule.
7. Run `pnpm test tests/rules.spec.ts` and `pnpm typecheck`. Iterate until green.

Never weaken or remove an existing rule from inside this command — that's a separate, explicit task.
