# Live — Staff Scheduling App

> Internal scheduling tool for **Live Active Wear** (liveactivewear.com) to manage retail staff across multiple stores, week-by-week, with rules, stats, and personal calendar feeds.

---

## 1. Product summary

A single-admin web app where a manager builds weekly schedules (Monday → Sunday), assigns shifts to employees across multiple store locations, and publishes them. Each employee receives:

- An email with their week's shifts
- A personal ICS calendar URL they can subscribe to in iCal / Google Calendar / Outlook
- A read-only web page with their schedule, stats, and a time-off request form

The admin sees a live calendar grid, conflict warnings (rule violations), per-employee stats, and a time-off requests inbox.

### Why this matters
Retail scheduling done in spreadsheets breaks down once you have:
- More than one store
- Rules per employee (max days/week, preferred days off, hour caps)
- Two daily shifts with overlapping coverage needs
- Anyone asking "how many hours did I work last month?"

This app replaces the spreadsheet, removes ambiguity ("did anyone tell me the schedule changed?"), and gives the manager a single pane of glass.

---

## 2. Decisions locked in this session

| Decision | Choice | Rationale |
|---|---|---|
| Auth model | **Admin-only login** | Employees get magic-link URLs + ICS feed + email. No employee password flows = ~1 week saved. |
| Locations | **Multi-location from day one** | Cheap to add now (`location_id` FK on employees + schedules), painful to retrofit. |
| Email flows | Publish, shift change, day-before reminder, time-off status | All four via Resend. Day-before triggered by Vercel cron. |
| Stack | Next.js 15 App Router + Supabase + Resend + Vercel | Vercel-native; Supabase via Vercel Marketplace; admin auth via Supabase Auth. |
| UI | Tailwind + shadcn/ui | Fast, customizable, matches "clean & professional" requirement. |
| Time | All shift times stored in store's timezone | Multi-location across timezones is realistic; UTC-only would force constant conversion. |

---

## 3. Core domain model

### Entities

```
Location
  id, name, slug, address, timezone, color
  ─ many ─> Employee
  ─ many ─> ShiftTemplate
  ─ many ─> Schedule

ShiftTemplate                  # the two shifts the user mentioned
  id, location_id
  name              "Morning" | "Evening" | custom
  start_time        09:30
  end_time          17:30
  color
  default_headcount  # min coverage per day

Employee
  id, location_id, name, email, phone, avatar_color
  role              "sales_rep" | "shift_lead" | "store_manager"
  weekly_hour_target           e.g. 40
  max_days_per_week            e.g. 5
  weekly_days_off              e.g. 2
  preferred_days_off           ["sunday","monday"]  # soft constraint
  hire_date, active
  magic_token        # unique per-employee URL token (rotatable)

Schedule
  id, location_id, week_start (Monday date)
  status            "draft" | "published"
  published_at, published_by
  unique(location_id, week_start)

Shift
  id, schedule_id, employee_id, date
  shift_template_id (nullable — allows ad-hoc shifts)
  start_time, end_time             # denormalized from template at creation
  notes
  index (schedule_id, employee_id, date)

TimeOffRequest
  id, employee_id, start_date, end_date, reason
  status            "pending" | "approved" | "rejected"
  submitted_at, decided_at, decided_by, decided_note

AuditLog
  id, actor (admin user id), action, entity, entity_id, diff, created_at
```

### Key invariants (enforced by the rules engine, not just the DB)

1. An employee cannot have two overlapping shifts on the same day.
2. An employee cannot be scheduled during an approved time-off range.
3. An employee cannot exceed `max_days_per_week` (hard) or fall below `weekly_days_off` (hard).
4. `weekly_hour_target` is a **soft** rule (warning, not block).
5. `preferred_days_off` is a **soft** rule (warning).
6. Each `ShiftTemplate.default_headcount` should be met for each weekday (warning if not).

Hard rule violations prevent **publishing**. Drafts can hold violations so the manager can edit toward a valid plan.

---

## 4. Feature breakdown by surface

### Admin (`/admin/*`, auth required)

- **Dashboard** — this week + next week at a glance; pending time-off requests; coverage health per location; upcoming reminders queue.
- **Schedules**
  - Week picker (Monday → Sunday grid)
  - Rows = employees, columns = days; cells show shift chips
  - Click cell → assign shift template or custom shift
  - Real-time rule validation banner ("3 warnings, 0 blockers")
  - Draft → Publish button (gated on zero hard violations)
  - "Copy from last week" action
  - Per-week summary: total hours per employee, coverage per template
- **Employees** — CRUD; per-employee page shows historical hours, attendance, upcoming shifts, ICS link, magic URL.
- **Locations** — CRUD; per-location settings (timezone, colors, default templates).
- **Shift templates** — CRUD per location.
- **Time-off requests** — Inbox; approve/reject with optional note → email.
- **Settings** — Resend domain config, default rules, admin profile.

### Public, no login (`/s/[token]/*`)

- **Employee schedule page** — Read-only; shows current week + next 4 weeks of published shifts, monthly hours, days worked, days off this month, link to subscribe via ICS.
- **ICS feed** — `/s/[token]/calendar.ics` returns a live calendar feed.
- **Time-off request form** — Submit a request; status check by email.

### Webhooks / cron

- `/api/cron/shift-reminders` — Daily at 18:00 local; emails everyone whose next shift is within 24h.
- `/api/cron/digest` — (Phase 7) weekly Sunday digest to admin.

---

## 5. Rules engine

Centralized in `src/lib/scheduling/rules.ts`. Pure functions, no DB calls, fully unit-testable.

```ts
type Violation = {
  level: "block" | "warn";
  code: "MAX_DAYS_EXCEEDED" | "OVERLAPPING_SHIFTS" | "ON_TIME_OFF"
      | "BELOW_MIN_DAYS_OFF" | "BELOW_COVERAGE" | "ABOVE_HOUR_TARGET"
      | "PREFERRED_DAY_OFF_USED";
  employeeId?: string;
  date?: string;
  message: string;
};

function validateSchedule(input: {
  schedule: Schedule;
  shifts: Shift[];
  employees: Employee[];
  timeOff: TimeOffRequest[];
  templates: ShiftTemplate[];
}): Violation[];
```

Called on every edit (debounced) and again server-side at publish time. UI surfaces violations inline on the affected day/employee.

---

## 6. Stats engine

`src/lib/scheduling/stats.ts` — pure functions over published shifts.

Per employee, per month:
- Total hours worked
- Days worked / days off
- Avg shift length
- Morning vs. evening shift split
- Adherence to preferred days off (%)
- Adherence to weekly hour target (%)

Per location:
- Total payroll-hours
- Coverage rate per template per weekday
- Open shift count

Exposed via:
- Admin dashboard widgets
- `/admin/employees/[id]/stats`
- Public `/s/[token]` (employee-scoped subset)

---

## 7. Tech stack

| Layer | Choice |
|---|---|
| Package manager | **pnpm** |
| Framework | **Next.js 15** App Router |
| Runtime | Node.js 24 on Vercel Fluid Compute |
| Hosting | Vercel |
| Project config | `vercel.ts` (typed, replaces vercel.json) |
| DB + Auth | **Supabase** (provisioned via Vercel Marketplace) |
| Email | **Resend** (transactional + ICS attachments) |
| ICS | `ical-generator` |
| Styling | Tailwind v4 + **shadcn/ui** |
| Forms | React Hook Form + Zod |
| Dates | `date-fns` + `date-fns-tz` |
| Charts (stats) | `recharts` |
| Tables | `@tanstack/react-table` |
| State (calendar UI) | Server Components + lightweight client state via `nuqs` for week navigation |
| Drag & drop (Phase 2) | `dnd-kit` |
| AI Gateway (future) | Vercel AI Gateway for the natural-language scheduling assistant ("schedule Maria mornings next week") |

### Why Supabase
- Row-Level Security guards admin-only tables
- Realtime is a future-friendly path for multi-admin (Phase 8)
- Excellent local dev story via `supabase` CLI
- Marketplace provisioning means env vars auto-wire on Vercel

### Why not Vercel KV / Postgres (note)
Vercel-managed KV/Postgres products were retired. We use Supabase from the Vercel Marketplace instead. (See knowledge update.)

---

## 8. Project structure

```
live/
├── README.md                     # Human-facing overview, setup, scripts
├── AGENTS.md                     # Spec for any agent/CI working in this repo (OpenAI Codex / others)
├── PLAN.md                       # This document
├── CHANGELOG.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── vercel.ts                     # Vercel config (cron, rewrites, headers)
├── tailwind.config.ts
├── postcss.config.js
├── eslint.config.js
├── .env.example
├── .env.local                    # gitignored
├── .gitignore
├── .mcp.json                     # Project-scoped MCP servers (Supabase, Vercel, Resend)
│
├── .claude/
│   ├── CLAUDE.md                 # Project memory loaded every session
│   ├── settings.json             # Shared team settings (committed)
│   ├── settings.local.json       # Personal overrides (gitignored)
│   ├── commands/
│   │   ├── new-feature.md        # Scaffolds feature module + tests
│   │   ├── add-shift-rule.md     # Adds a rule to the scheduling engine with tests
│   │   ├── db-migrate.md         # Creates a new Supabase migration safely
│   │   ├── seed.md               # Seeds locations + employees + templates
│   │   ├── publish-flow.md       # Runs publish + email locally against test data
│   │   └── deploy.md             # Pre-deploy checks then vercel deploy
│   ├── agents/
│   │   ├── scheduler-domain.md   # Subagent: scheduling-domain expert (rules, conflicts)
│   │   ├── supabase-architect.md # Subagent: migrations, RLS, indexes
│   │   └── email-templater.md    # Subagent: Resend React Email templates
│   ├── hooks/
│   │   ├── post-edit-typecheck.sh
│   │   ├── pre-commit-lint.sh
│   │   └── on-stop-summary.sh    # Prints a one-line "what changed" on Stop
│   ├── rules/                    # Domain rules referenced by commands & subagents
│   │   ├── code-style.md
│   │   ├── data-model.md         # Source of truth for schema decisions
│   │   ├── ui-patterns.md        # Shadcn usage, color, accessibility
│   │   ├── security.md           # RLS, magic tokens, secrets
│   │   └── testing.md
│   └── skills/                   # Project-specific skills
│       ├── scheduling-skill/     # "How we model and validate schedules"
│       └── ics-feed-skill/       # "How we generate calendar feeds"
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 0001_initial.sql      # Tables, indexes
│   │   ├── 0002_rls.sql          # RLS policies
│   │   └── 0003_seed_helpers.sql
│   ├── seed.sql
│   └── functions/                # (optional) Postgres functions, e.g., weekly_hours
│
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Marketing-ish landing → redirects to /admin
│   │   ├── (admin)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── schedules/
│   │   │   │   ├── page.tsx                  # Picks current week
│   │   │   │   └── [location]/[week]/page.tsx
│   │   │   ├── employees/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── locations/page.tsx
│   │   │   ├── templates/page.tsx
│   │   │   ├── time-off/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── (public)/
│   │   │   ├── s/[token]/page.tsx            # Employee public schedule
│   │   │   ├── s/[token]/calendar.ics/route.ts
│   │   │   └── request-time-off/page.tsx
│   │   └── api/
│   │       ├── cron/
│   │       │   └── shift-reminders/route.ts
│   │       └── webhooks/
│   │           └── resend/route.ts           # Bounces, complaints
│   │
│   ├── components/
│   │   ├── ui/                   # shadcn primitives
│   │   ├── calendar/
│   │   │   ├── week-grid.tsx
│   │   │   ├── day-cell.tsx
│   │   │   ├── shift-chip.tsx
│   │   │   ├── shift-editor.tsx
│   │   │   └── violations-banner.tsx
│   │   ├── employee/
│   │   │   ├── employee-form.tsx
│   │   │   ├── employee-card.tsx
│   │   │   └── stats-widgets.tsx
│   │   └── shared/
│   │       ├── week-picker.tsx
│   │       └── location-switcher.tsx
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── server.ts         # createServerClient
│   │   │   ├── browser.ts        # createBrowserClient
│   │   │   ├── service.ts        # Service-role (server-only)
│   │   │   └── types.ts          # Generated DB types
│   │   ├── resend.ts             # Resend client + sendSafe wrapper
│   │   ├── ical.ts               # ICS feed builder
│   │   ├── auth.ts               # Admin session helpers
│   │   ├── magic-token.ts        # Generate / rotate / verify employee tokens
│   │   ├── scheduling/
│   │   │   ├── rules.ts          # validateSchedule, all Violation logic
│   │   │   ├── conflicts.ts      # Helpers used by rules
│   │   │   ├── stats.ts          # Pure stats functions
│   │   │   ├── publish.ts        # publishSchedule (orchestrates emails)
│   │   │   └── week.ts           # Week math helpers (Mon-anchored)
│   │   ├── emails/               # React Email templates
│   │   │   ├── schedule-published.tsx
│   │   │   ├── shift-changed.tsx
│   │   │   ├── shift-reminder.tsx
│   │   │   └── time-off-decision.tsx
│   │   └── utils.ts
│   │
│   ├── server/                   # Server Actions
│   │   ├── schedules.ts
│   │   ├── shifts.ts
│   │   ├── employees.ts
│   │   ├── locations.ts
│   │   ├── templates.ts
│   │   ├── time-off.ts
│   │   └── auth.ts
│   │
│   └── types/
│       ├── db.ts                 # Re-exports + helpers from generated types
│       └── domain.ts             # App-level types (Violation, etc.)
│
└── tests/
    ├── rules.spec.ts             # The most important test file in the repo
    ├── stats.spec.ts
    ├── ics.spec.ts
    └── publish.spec.ts
```

### Why this structure
- `lib/scheduling/*` is pure, deterministic, and unit-tested — the heart of the app.
- `server/*` are the only places that touch the database, keeping side effects easy to audit.
- `(admin)` and `(public)` route groups make auth boundaries visible in the file tree.
- `.claude/` is rich enough to actually pay off — commands automate the repetitive moves (new migration, new feature, new rule), and subagents own bounded surfaces.

---

## 9. `.claude/` setup

### `CLAUDE.md` (project memory) — outline
- Project mission (one paragraph from §1)
- Stack at a glance
- "Never do" list (e.g., don't run `supabase db reset` without confirming, don't email real addresses from dev)
- Where the rules engine lives + how to add a rule
- Coding standards: server actions for mutations, no client-side DB calls, Zod at every boundary
- Test before publish: `pnpm test` and `pnpm typecheck` must pass

### Commands (slash commands)
| Command | What it does |
|---|---|
| `/new-feature <name>` | Scaffolds a feature folder (component + server action + test) using the scheduler-domain agent. |
| `/add-shift-rule <code>` | Adds a new Violation code, the validator, and a test, with a CLAUDE.md update. |
| `/db-migrate <name>` | Creates a new file in `supabase/migrations/` and writes a typed migration; reminds about RLS. |
| `/seed` | Resets local Supabase + seeds locations, templates, employees. |
| `/publish-flow` | Runs the publish flow locally against test data with Resend in sandbox mode. |
| `/deploy` | Runs lint + typecheck + tests, then `vercel deploy --prebuilt`. |

### Subagents
- **`scheduler-domain`** — Owns rules engine and conflict detection. Must read `rules/data-model.md` and `lib/scheduling/*` before suggesting changes.
- **`supabase-architect`** — Owns migrations, indexes, and RLS. Forbidden from editing app code outside `lib/supabase/` and `supabase/`.
- **`email-templater`** — Owns React Email templates and Resend sending wrappers. Tests with `RESEND_DRY_RUN=true`.

### Hooks
- **PostToolUse Edit** → `post-edit-typecheck.sh` runs `tsc --noEmit` on changed files.
- **PreToolUse Bash** → block `supabase db reset` unless flag `--i-mean-it` present.
- **Stop** → `on-stop-summary.sh` prints `git status` + last 3 changed files so the next session resumes cleanly.

### Rules (long-form context for agents)
- `data-model.md` — Authoritative schema descriptions; updated alongside migrations.
- `ui-patterns.md` — When to use shadcn `Dialog` vs `Sheet`, color tokens, density, accessibility.
- `security.md` — Magic tokens are 32-byte URL-safe; rotated on email change; never logged.
- `testing.md` — Rules engine has 100% line coverage as a CI gate.

### Skills
- **`scheduling-skill/`** — Encodes the publishing algorithm: validate → snapshot → write → enqueue emails → audit log.
- **`ics-feed-skill/`** — How we generate per-employee ICS, including timezone handling and ETag caching.

---

## 10. `.mcp.json` — MCP servers

Project-scoped so the team gets the same MCP servers automatically.

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--project-ref=${SUPABASE_PROJECT_REF}"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    },
    "vercel": {
      "command": "npx",
      "args": ["-y", "@vercel/mcp-server@latest"],
      "env": {
        "VERCEL_TOKEN": "${VERCEL_TOKEN}",
        "VERCEL_TEAM_ID": "${VERCEL_TEAM_ID}",
        "VERCEL_PROJECT_ID": "${VERCEL_PROJECT_ID}"
      }
    },
    "resend": {
      "command": "npx",
      "args": ["-y", "mcp-send-email@latest"],
      "env": {
        "RESEND_API_KEY": "${RESEND_API_KEY}",
        "SENDER_EMAIL_ADDRESS": "${SENDER_EMAIL_ADDRESS}",
        "REPLY_TO_EMAIL_ADDRESSES": "${REPLY_TO_EMAIL_ADDRESSES}"
      }
    }
  }
}
```

Each env var is resolved from the user's shell or `.env` (not committed). `MCP_SECURITY_CHECK` to be reviewed at scaffold time per current MCP best practice.

---

## 11. Environment variables

`.env.example` (committed) and `.env.local` (gitignored):

```env
# Supabase (provisioned via Vercel Marketplace; pulled by `vercel env pull`)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=
SUPABASE_ACCESS_TOKEN=

# Resend
RESEND_API_KEY=
SENDER_EMAIL_ADDRESS=schedules@liveactivewear.com
REPLY_TO_EMAIL_ADDRESSES=ops@liveactivewear.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
MAGIC_TOKEN_SECRET=
CRON_SECRET=

# Vercel (for MCP only)
VERCEL_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
```

---

## 12. Build phases & rough budget

| Phase | Scope | Effort |
|---|---|---|
| **0. Bootstrap** | Repo, Next.js, Supabase via Marketplace, Vercel link, env, MCP config, `.claude/` setup, README/AGENTS | 0.5 day |
| **1. Schema + Auth + CRUD** | Migrations, RLS, admin auth, Locations/Employees/Templates CRUD | 1.5 days |
| **2. Schedule grid** | Week grid UI, shift create/edit/delete, copy-from-last-week | 2 days |
| **3. Rules engine** | `validateSchedule` + violation UI + per-week summary | 1.5 days |
| **4. Publish + Email + ICS** | Publish workflow, Resend templates, ICS feed, magic token URLs | 1.5 days |
| **5. Time-off flow** | Public request form, admin inbox, decision emails, blocking shift conflicts | 1 day |
| **6. Stats + Dashboard** | Per-employee stats page, admin dashboard widgets | 1 day |
| **7. Cron + Polish** | Day-before reminder cron, audit log, accessibility, mobile pass, deploy | 1 day |
| **Total** | | **~10 working days** |

Phases 2–4 are sequential because each builds on the prior. Phases 5/6 can be done in parallel once 4 lands.

---

## 13. Confirmed decisions (round 2)

1. **Brand**: Extend liveactivewear.com. Dark, sporty, sans-serif. shadcn theme tuned to a dark base with a single bright accent (we'll pull the exact accent from the live site at scaffold time).
2. **Timezone**: Multi-TZ from day one. Every `Location` has an IANA timezone (e.g. `America/Bogota`, `America/New_York`). All shifts displayed in the location's local time; ICS feeds emit `TZID` per location.
3. **Languages**: English only in v1. No i18n scaffolding (avoids dead infrastructure).
4. **Resend domain**: Already verified. **Dev/testing will start with a placeholder sender** (Resend's `onboarding@resend.dev` works for local + previews) controlled by `SENDER_EMAIL_ADDRESS` env var. Production sender (`schedules.liveactivewear.com` or similar) wired in Phase 4 after testing confirms the flows.
5. **Roles**: Staff are primarily **sales reps in stores**. v1 roles (cosmetic + light permission hints, not full RBAC):
   - `sales_rep` — default, the bulk of the staff
   - `shift_lead` — opens/closes the store; surfaced in the calendar with a small badge
   - `store_manager` — store-level lead; shown distinctly in stats
   The admin is a separate concept (Supabase Auth user) and is not in the `employees` table.

---

## 14. Out of scope (v1)

- Multi-admin (single admin user in v1; the schema supports more later).
- Shift swapping between employees (Phase 8+).
- Payroll export / integration.
- Mobile apps (the PWA via Next.js covers field use).
- Forecasting / auto-generated schedules (a later "AI assistant" mode using Vercel AI Gateway).

---

## 15. Next step

Confirm the plan or push back on §13. On approval, scaffold proceeds in this order:

1. Phase 0 (repo + `.claude/` + MCP + Vercel + Supabase link)
2. Phase 1 (schema + auth + CRUD)
3. ...continuing through the build phases above.
