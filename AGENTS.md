# AGENTS.md — Working Agreement for AI Agents

> This file briefs any AI agent (OpenAI Codex, Cursor, Copilot Workspace, others) before it touches this repo. Claude Code reads `CLAUDE.md` in addition to this.

<!-- BEGIN:nextjs-agent-rules -->
## This is NOT the Next.js you know

This project uses Next.js 16 (App Router). APIs, conventions, and file structure may differ from older training data. Heed deprecation notices. When in doubt, read the relevant file under `node_modules/next/dist/docs/` before writing code.
<!-- END:nextjs-agent-rules -->

## Project at a glance

- **What**: Weekly staff scheduling app for Live Active Wear (multi-location retail)
- **Who**: One admin builds schedules; employees consume them via email + ICS feed + a magic-link page
- **Stack**: Next.js 16, Supabase, Resend, Vercel, Tailwind v4, shadcn/ui
- **Plan & decisions**: [`PLAN.md`](./PLAN.md)

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

## Never do

- `supabase db reset` against anything that isn't `http://127.0.0.1`.
- Disable RLS, even temporarily.
- Commit anything matching `*.env*` (other than `.env.example`), `*.key`, or `*secret*`.
- Send real emails from dev. Use `RESEND_DRY_RUN=true`.
- Add features the user didn't ask for. Don't introduce abstractions for hypotheticals.
- Bypass `validateSchedule()` in the publish flow.

## How to ask for help

If a task is ambiguous, stop and ask. Better to ask "which timezone are these times in?" than to silently pick one and ship a bug six weeks later.
