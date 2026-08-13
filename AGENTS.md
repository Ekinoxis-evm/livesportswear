# AGENTS.md — Working Agreement for AI Agents

> This file briefs any AI agent (OpenAI Codex, Cursor, Copilot Workspace, others) before it touches this repo. Claude Code reads `CLAUDE.md` in addition to this.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This project uses Next.js 16 (App Router). APIs, conventions, and file structure may differ from older training data. Heed deprecation notices. When in doubt, read the relevant file under `node_modules/next/dist/docs/` before writing code.
<!-- END:nextjs-agent-rules -->

## Project at a glance

- **What**: Store-ops app for Live Active Wear — staff scheduling **plus** a store kiosk
  (check-in, floor rotation, sales/orders, close-day report), inventory (barcode counts +
  receiving), Shopify net-sales sync, commission & contests. See `CLAUDE.md` for the full
  surface map; it's the source of truth, not just scheduling.
- **Who**: Admins run scheduling + performance; a shared per-store kiosk account runs the floor;
  employees get a portal + magic-link schedule/ICS.
- **Stack**: Next.js 16, Supabase, Resend, Shopify Admin API, Vercel AI SDK (receiving), Vercel, Tailwind v4, shadcn/ui
- **Plan & decisions**: deeper rules in `.claude/rules/*` and the "Current state" log in `CLAUDE.md`

## Where to put code

| If you're adding... | Put it in... |
|---|---|
| A pure scheduling rule, stat, or publish logic | `src/lib/scheduling/*.ts` (no DB calls allowed) |
| A DB write or mutation | `src/server/<domain>.ts` (server actions) |
| An admin page | `src/app/admin/...` |
| A public/employee-facing page | `src/app/{s,w,portal,store}/...` |
| A cron handler | `src/app/api/cron/<name>/route.ts` |
| An email template | `src/lib/emails/<template>.tsx` |
| A new DB table | A new file in `supabase/migrations/` |
| Domain types | `src/types/domain.ts` |

## Conventions

- TypeScript strict mode. Don't use `any`.
- Server Components by default; mark client components with `"use client"`.
- Validate every server-action input with Zod.
- Server-only secrets go behind `import "server-only"`.
- Never log magic tokens, emails (unmasked), or service-role keys.

## Rules engine

- Located in `src/lib/scheduling/rules.ts`.
- `validateSchedule()` is the only entry point.
- Returns `Violation[]` with `level: "block" | "warn"`.
- Hard rules (block): `OVERLAPPING_SHIFTS`, `ON_TIME_OFF`, `MAX_DAYS_EXCEEDED`, `BELOW_MIN_DAYS_OFF`.
- Soft rules (warn): `BELOW_COVERAGE`, `ABOVE_HOUR_TARGET`, `ABOVE_BIWEEKLY_HOURS`.
- Tests live in `tests/rules.spec.ts`. Adding a rule? Add at least three tests.

## Before you submit

Run all of these:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI runs the same. If you can't get them green, hand back to the user with a clear blocker.

## Applying migrations

Migration files are numbered (`0001..NNNN`), but **`supabase db push` does not work here** — the remote history uses timestamp IDs it can't reconcile with the numbered files. Apply to prod with **`.claude/scripts/db-apply.sh <name>`** (`--check` prints applied vs. on-disk); it wraps the Supabase Management API query endpoint and also writes the ledger row the API-applied migrations would otherwise skip. Never hand-roll the `curl` — see `.claude/commands/db-migrate.md`. **Ask the operator before applying**: the Supabase MCP is read-only and DB writes are permission-gated, so an apply is always an explicit, per-migration decision.

**Schema leads code.** Apply the migration *before* the code that depends on it ships — a column that doesn't exist yet turns into a failing insert in production, not a build error.

## Never do

- `supabase db reset` against anything that isn't `http://127.0.0.1`.
- Disable RLS, even temporarily.
- Commit anything matching `*.env*` (other than `.env.example`), `*.key`, or `*secret*`.
- Send real emails from dev. Use `RESEND_DRY_RUN=true`.
- Add features the user didn't ask for. Don't introduce abstractions for hypotheticals.
- Bypass `validateSchedule()` in the publish flow.

## How to ask for help

If a task is ambiguous, stop and ask. Better to ask "which timezone are these times in?" than to silently pick one and ship a bug six weeks later.
