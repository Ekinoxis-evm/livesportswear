# Live — Project Memory for Claude Code

> This file is loaded into every Claude Code session. Keep it tight; long-form context lives in `.claude/rules/*`.

## Mission
Internal ops app for **Live Active Wear** (liveactivewear.com), in production at livesportswear.vercel.app. Three surfaces:
- **Admin**: weekly schedules (Mon–Sun) with a rules engine (hard limits block publish, soft ones warn), a Performance hub (Daily floor · Sales · Rewards), and Sales & Rewards setup (goals, commission tiers, contests, per-rep monthly goals).
- **Store kiosk** (shared iPad login, `role=store`): check-in/out with PIN + face photo, the rotation queue ("up system") with breaks/undo, sales contests leaderboard, close-day report.
- **Employee portal + public pages**: personal schedule/sales/rewards, magic-token schedule page + ICS feed, public store-week page.

**Sales metric everywhere = NET sales** (Shopify `current_subtotal_price`: after discounts/refunds, excluding taxes+shipping). Conversion counts live in `client_events`; money comes from Shopify.

## Stack (one-liner)
Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui (Base UI) · Supabase (Postgres + Auth) · Resend · Shopify Admin API · Vercel · pnpm.

## How this codebase is organized
- `src/lib/scheduling/` — pure scheduling functions: rules engine, conflicts, stats, week/payroll math. **No DB calls here.**
- `src/lib/` — other pure domain libs (same no-DB rule): `rewards.ts` (contest standings), `floor-queue.ts` + `floor-state.ts` (kiosk queue), `breaks.ts`, `commission.ts`, `conversion.ts`, `attendance.ts`, `shopify-range*.ts`, `monthly-series.ts`.
- `src/server/` — server actions and server-only assembly (the only place DB mutations happen). `*-core.ts` files hold shared bodies (floor, conversion).
- `src/lib/supabase/` — Supabase clients (server, browser, service-role).
- `src/app/admin/` — admin UI (role=admin). Sidebar groups the team routes under an **Employees** section (Profiles=`/employees` · Schedule=`/schedules` · Performance=`/performance` · Rewards & Commission=`/commission#…`) — a nav grouping only, routes are unchanged. Performance is a route-tab hub (`performance/{daily,sales,rewards}`); `/admin/commission` is the "Sales & Rewards setup" page; `/admin/clients` is the contact-attribution view; old `/admin/{sales,rewards}` are redirect stubs.
- `src/app/portal/` — employee portal (role=employee): Performance / Schedule / Rewards / Settings. Performance is a route-tab hub in the `(performance)` route group — Overview (`/portal`, DB-only) · Sales (`/portal/sales`) · Clients (`/portal/clients`), both period-driven.
- `src/app/store/` — the kiosk (role=store): Check-in / Schedule / Sales (center) / Performance / Rewards, 45s auto-refresh.
- `src/app/s/[token]/` + `src/app/w/[token]/` — public magic-token pages (employee schedule + ICS; store week + sales ranking).
- `src/app/api/cron/` — `shopify-sync` (also finalizes ended contests), `stale-checkins`, `photo-retention`, `meta-sync`. All check `CRON_SECRET`.
- `src/lib/emails/` — React Email templates (schedule-published, day-report, credentials, time-off-decision).
- `supabase/migrations/` — append-only, currently through `0042`.
- `.claude/` — agents, commands, hooks, rules, project skills.

## Coding standards (short version)
- Server-side mutations only via files in `src/server/`. Components never write to the DB.
- Zod validation at every boundary: server actions inputs, route handler payloads, env parsing.
- `validateSchedule()` from `lib/scheduling/rules.ts` runs at publish (`src/server/schedules.ts`) — never bypass.
- Magic tokens are 32-byte URL-safe random; **never log them**, never expose in error messages.
- Dates: store as `date` (no time) for shift dates; times as `time` in location-local; render with `date-fns-tz` and the location's IANA TZ. "Today" = `businessDate(tz)`.
- Complex create/edit forms use the shared `Wizard` shell (`src/components/shared/wizard.tsx`); side edits use Sheets; confirms use Dialogs.
- Don't add features beyond the current task. Don't add abstractions for hypotheticals. No backwards-compat shims.

## Never do
- `supabase db reset` without `--i-mean-it` (a pre-tool-use hook enforces this).
- Send real emails from dev. `RESEND_DRY_RUN=true` in `.env.local` for local work.
- Commit `.env.local`, `*.key`, or anything matching `*secret*`.
- Bypass RLS with the service-role client outside token-verified public routes, cron handlers, or admin/kiosk server actions (see `.claude/rules/security.md`).
- Write floor/queue state from anywhere but the kiosk server actions (`src/server/store-floor.ts`) — the kiosk is the floor's single writer.

## Where to find specifics
- Schema decisions: `.claude/rules/data-model.md`
- UI patterns (Dialog vs Sheet vs Wizard, color usage): `.claude/rules/ui-patterns.md`
- Security (roles, RLS, magic tokens, hardening): `.claude/rules/security.md`
- Testing (rules engine coverage gate): `.claude/rules/testing.md`
- Go-live keys checklist: `docs/ready-for-keys.md`
- Adding a scheduling rule: `/add-shift-rule` slash command
- **Applying a migration to prod**: NOT `supabase db push` (remote history uses
  timestamp IDs, files are numbered → the CLI can't reconcile). Use the Supabase
  Management API query endpoint — see `.claude/commands/db-migrate.md` for the
  exact `curl`. Needs operator approval (MCP is read-only; classifier blocks
  self-applied DB writes).

## Current state
In production since 2026-07. Live: scheduling + publish emails/ICS, time-off, store kiosk (PIN/photo check-in, FIFO turn order by available_since with bump/drag overrides, multi-client, breaks on the Check-in tab, undo, close-day report emailed as CSV + a 4-sheet **XLSX** workbook (Summary·Employees·Client events·Check-ins, per-employee net·orders·avg-ticket) + PDF), 5-tab kiosk nav (Check-in · Schedule · SALES center button · Performance · Rewards) with a read-only Schedule page (today/week), Shopify net-sales sync (10-min GitHub Action + daily cron) with 2024→now history, dashboards + year charts (month Ranking with commission lives on the Dashboard), the **sales-period module** (PeriodPills + SalesRankTable: Today · Week · Month · Custom — the canonical ranked-sales pattern on kiosk/dashboard/admin-sales/public week page), commission tiers, sales contests v3, per-rep monthly goals, per-location admins, security-hardened RLS helpers, **inventory suite** — two count types: **Counting** (barcode counts with confirm-scan + qty, product-type categories, camera scanning incl. iPhone via zxing ponyfill + guided scan zone, scanner-connection indicator, store inventory book, staged Shopify push draft→review→write with write_inventory) and **New Stock/receiving** (upload an arrival doc → CSV parse or AI vision extraction via the Vercel AI Gateway → match by barcode/SKU → physically verify → additive merge that adds arrived onto current Shopify on-hand), **sold→Shopify order + customer linking** (client-history seed: order/customer on client_events, shown in day reports and the admin Clients view with per-rep contact attribution), employee color palette picker + kiosk profile photos, a 5-area audit hardening pass (scoped store-account admin, atomic finish, true book replace, per-store portal rank, close-day idempotency), the **sepia rebrand** (app accent moved from forest green to the "Sepia Brown" palette — beige bg + deep-sepia CTAs + charcoal-brown sidebar, centralized in `globals.css`), **editable daily-report recipients** (`store_report_recipients`, managed on admin Performance→Daily *and* the kiosk close-day area via the shared `RecipientsManager`, with a "Send test report" button that surfaces real delivery failures), and the **kiosk today's-orders + attendance views** (`/store/performance`): a "Clients attended today" list from `client_events` (per attendee: sold/no-sale, contact, return, linked order + amount, customer) and an "Orders today" card of the day's real POS sales (`source_name='pos'` only — this Shopify store is POS-only; online lives on a separate shop; `shopify_draft_order`/other are excluded) with store total + each seller's orders · net · average ticket, attributed by `order.user_id`→`employees.shopify_staff_id` (`src/lib/orders-today.ts`, `fetchDayOrders`), a **return/exchange type** step on the kiosk finish flow (`client_events.return_type` — report label only, no metric change) with a set-apart Return/Exchange floor button, **kiosk responsiveness** work (route `loading.tsx` skeletons, parallel Shopify reads, `useLinkStatus` nav spinners, `touch-action: manipulation`), and the **portal Performance hub** — `/portal` split into Overview · Sales · Clients tabs so a rep sees what admin/kiosk already capture: all-time net sales / best month / monthly average + personal-goal bar + their own year chart (DB-only, no Shopify call), then per-period orders · average ticket · largest sale · best day · most orders in a day · rank (live Shopify per-order data via `getRangeOrdersCached` + the pure `src/lib/personal-stats.ts`; records are **within the selected period**, not all-time), and conversion + "clients in Shopify" where a client counts as **new** when their Shopify `created_at` falls inside the period they bought (Shopify records no created-by-staff, so attribution follows the sale) alongside the exact kiosk-captured contact list, and **client attribution** (`customer_origin`, 0042) — Shopify is the client book, so `/admin/clients` now lists Shopify's customers (searched via `customers/search.json`, hydrated per page) annotated with the rep who brought each one in, derived from that customer's first POS order back to 2024 rather than from kiosk linking; the kiosk Sold flow lost its quiet "Skip" in favour of an equal-weight "No customer on this sale" and a 12-order list.
