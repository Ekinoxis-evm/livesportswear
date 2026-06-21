# Live — Project Memory for Claude Code

> This file is loaded into every Claude Code session. Keep it tight; long-form context lives in `.claude/rules/*` and `PLAN.md`.

## Mission
Internal scheduling app for **Live Active Wear** (liveactivewear.com). One admin builds weekly schedules (Mon–Sun) across multiple store locations; employees receive emails + a personal ICS calendar feed + a read-only schedule page. Rules engine enforces hard limits (max days/week, conflicts, time-off) and warns on soft ones (preferred days off, hour targets).

## Stack (one-liner)
Next.js 15 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · Supabase (Postgres + Auth) · Resend · Vercel · pnpm.

Full plan: see `PLAN.md`.

## How this codebase is organized
- `src/lib/scheduling/` — pure functions: rules engine, conflicts, stats, week math, publish. **No DB calls here.** This is the heart of the app.
- `src/server/` — server actions (the only place DB mutations happen).
- `src/lib/supabase/` — Supabase clients (server, browser, service-role).
- `src/app/(admin)/` — admin UI (auth required).
- `src/app/(public)/` — employee-facing public pages + ICS feed (magic-token URLs).
- `src/lib/emails/` — React Email templates.
- `supabase/migrations/` — append-only migrations.
- `.claude/` — slash commands, subagents, hooks, rules, project skills.

## Coding standards (short version)
- Server-side mutations only via files in `src/server/`. Components never write to the DB.
- Zod validation at every boundary: server actions inputs, route handler payloads, env parsing.
- `validateSchedule()` from `lib/scheduling/rules.ts` runs at publish — never bypass.
- Magic tokens are 32-byte URL-safe random; **never log them**, never expose in error messages.
- Dates: store as `date` (no time) for shift dates; times as `time` in location-local; render with `date-fns-tz` and the location's IANA TZ.
- Don't add features beyond the current task. Don't add abstractions for hypotheticals. No backwards-compat shims.

## Never do
- `supabase db reset` without `--i-mean-it` (a pre-tool-use hook enforces this).
- Send real emails from dev. `RESEND_DRY_RUN=true` in `.env.local` for local work.
- Commit `.env.local`, `*.key`, or anything matching `*secret*`.
- Bypass RLS by using the service-role client in any path that isn't an admin server action.

## Where to find specifics
- Schema decisions: `.claude/rules/data-model.md`
- UI patterns (when to use Dialog vs Sheet, color usage): `.claude/rules/ui-patterns.md`
- Security (RLS, magic tokens, secrets): `.claude/rules/security.md`
- Testing (rules engine coverage gate): `.claude/rules/testing.md`
- Adding a scheduling rule: `/add-shift-rule` slash command

## Build phases (we are here)
- [x] Phase 0 — Bootstrap
- [x] Phase 1 — Schema + Auth + CRUD
- [x] Phase 2 — Schedule grid + shift CRUD
- [x] Phase 3 — Rules engine
- [x] Phase 4 — Publish + email + ICS
- [x] Phase 5 — Time-off requests
- [ ] Phase 6 — Stats + dashboard
- [ ] Phase 7 — Cron + polish + deploy

Update the box as phases complete.
