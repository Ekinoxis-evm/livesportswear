# Live — Store Ops

Internal operations app for **Live Active Wear** (liveactivewear.com), in production at livesportswear.vercel.app. Three surfaces:

- **Admin** — weekly schedules with a rules engine, a Performance hub (Daily floor · Sales · Rewards), Sales & Rewards setup (goals, commission tiers, contests), the month sales Ranking, and the inventory suite (barcode counts, the store's inventory book, staged Shopify stock corrections).
- **Store kiosk** — a shared iPad per store: PIN + face-photo check-in/out, the FIFO rotation queue ("up system") with breaks and undo, sold/no-sale logging linked to the real Shopify order and customer, sales tables (Today · Week · Month · Custom), contests, and the close-day report.
- **Employee portal + public pages** — personal schedule/sales/rewards, magic-token schedule page + ICS feed, and the public store-week page with its sales ranking.

The sales metric everywhere is **NET sales** (Shopify `current_subtotal_price`).

> Working agreement for AI agents: [`AGENTS.md`](./AGENTS.md)
> Project memory for Claude Code: [`CLAUDE.md`](./CLAUDE.md)
> Schema source of truth: [`.claude/rules/data-model.md`](./.claude/rules/data-model.md)

## Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind v4 + shadcn/ui (light by default, dark-mode toggle) |
| Database | Supabase (Postgres + Auth) |
| Email | Resend |
| Hosting | Vercel (Fluid Compute) |
| Package manager | pnpm 10 |

## Prerequisites

- Node 22+ (24 recommended — Vercel's default)
- pnpm 10+
- A Supabase project (you'll create this yourself on a separate account)
- A Resend account with a verified sender domain (testing can use `onboarding@resend.dev`)
- A Vercel account (for production)

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env template and fill in real values
cp .env.example .env.local

# 3. Link your Supabase project (one-time)
pnpm supabase login
pnpm supabase link --project-ref <YOUR_PROJECT_REF>

# 4. Push schema migrations to your Supabase project
pnpm supabase db push

# 5. Generate the TypeScript types from your schema
pnpm supabase gen types typescript --linked > src/lib/supabase/types.ts

# 6. Start the dev server
pnpm dev
```

Open http://localhost:3000.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm typecheck` | `tsc --noEmit` over the whole repo |
| `pnpm test` | Run vitest once |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |

## Project structure

```
src/
  app/
    admin/        Auth-required admin UI (Performance hub, Sales & Rewards setup, inventory, …)
    portal/       Employee portal (performance, schedule, rewards)
    store/        Shared store kiosk (check-in, schedule, sales queue, performance, rewards)
    s/ , w/       Magic-token public pages (employee schedule + ICS, store week)
    api/cron/     Cron handlers (shopify-sync, stale-checkins, photo-retention, meta-sync)
  components/     UI components (shadcn primitives in ui/)
  lib/
    scheduling/   Rules engine, stats, week/payroll math — pure functions
    rewards.ts / floor-queue.ts / floor-state.ts / breaks.ts / commission.ts …
                  Other pure domain libs (no DB)
    supabase/     Server + browser + service clients
    emails/       React Email templates
    ical.ts       ICS feed builder
  server/         Server Actions — the only place that writes to the DB
  types/          Shared TypeScript types
supabase/
  migrations/     Append-only SQL migrations
.claude/          Commands, subagents, hooks, rules, skills for Claude Code
```

## Environment variables

See [`.env.example`](./.env.example). Required:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings → API → service role |
| `RESEND_API_KEY` | resend.com → API keys |
| `SENDER_EMAIL_ADDRESS` | Your verified sender, e.g. `schedules@notify.liveactivewear.com` |
| `MAGIC_TOKEN_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -base64 32` |

For Vercel deploys, set the same variables in **Vercel → Project → Settings → Environment Variables** or use `pnpm vercel env pull` after `vercel link`.

## MCP servers

This project ships with [`.mcp.json`](./.mcp.json) configured for:

- **Supabase MCP** — schema introspection, migration listing
- **Vercel MCP** — deployments, logs, env
- **Resend MCP** — send test emails from your AI agent

These activate inside Claude Code (or any MCP-aware client) when the relevant env vars are set in your shell or `.env.local`.

## Deployment

```bash
# Link the project to Vercel (one-time)
pnpm vercel link

# Pull env vars from Vercel to local
pnpm vercel env pull

# Preview deploy
pnpm vercel deploy --prebuilt

# Production deploy (requires explicit confirmation in the slash command)
pnpm vercel deploy --prod --prebuilt
```

The `/deploy` slash command in `.claude/commands/deploy.md` runs the full preflight (lint, typecheck, test, build) before deploying.

## License

Private — internal tool.
