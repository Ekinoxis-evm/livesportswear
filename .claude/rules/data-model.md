# Data Model — Source of Truth

> Every schema decision lives here. If you change a table, update this file in the same PR. Authoritative SQL lives in `supabase/migrations/`.

## Tables

### `locations`
A physical store.
- `id uuid pk`
- `name text not null` — display name, e.g. "Bogotá Andino"
- `slug text not null unique` — URL-safe
- `address text`
- `timezone text not null` — IANA, e.g. `America/Bogota`
- `color text` — hex, used for badges in admin UI
- `active boolean default true`
- `created_at, updated_at`

### `employees`
A worker. Always belongs to one location in v1 (no multi-location reps yet).
- `id uuid pk`
- `location_id uuid fk -> locations`
- `name text not null`
- `email text not null unique`
- `phone text`
- `avatar_color text`
- `role text not null` — enum: `sales_rep | shift_lead | store_manager`
- `weekly_hour_target int not null default 40`
- `max_days_per_week int not null default 5`        — hard rule
- `weekly_days_off int not null default 2`          — hard rule
- `preferred_days_off text[] not null default '{}'` — soft, lowercase weekday names
- `hire_date date`
- `active boolean default true`
- `magic_token text not null unique`                — see security.md
- `created_at, updated_at`

### `shift_templates`
A recurring shift definition per location.
- `id uuid pk`
- `location_id uuid fk -> locations`
- `name text not null` — "Morning", "Evening", custom
- `start_time time not null`                        — location-local
- `end_time time not null`                          — location-local
- `color text`
- `default_headcount int not null default 1`        — min coverage per day (warn rule)
- `active boolean default true`

### `schedules`
A week. One per (location, week_start).
- `id uuid pk`
- `location_id uuid fk -> locations`
- `week_start date not null`                        — must be a Monday
- `status text not null` — `draft | published`
- `published_at timestamptz`
- `published_by uuid` — admin user id (Supabase Auth)
- `created_at, updated_at`
- `unique (location_id, week_start)`

### `shifts`
One assignment.
- `id uuid pk`
- `schedule_id uuid fk -> schedules`
- `employee_id uuid fk -> employees`
- `date date not null`
- `shift_template_id uuid fk -> shift_templates` (nullable)
- `start_time time not null`                        — denormalized from template
- `end_time time not null`
- `notes text`
- `created_at, updated_at`
- index `(schedule_id, employee_id, date)`

### `time_off_requests`
- `id uuid pk`
- `employee_id uuid fk -> employees`
- `start_date date not null`
- `end_date date not null`
- `reason text`
- `status text not null default 'pending'` — `pending | approved | rejected`
- `submitted_at timestamptz not null default now()`
- `decided_at timestamptz`
- `decided_by uuid` — admin user id
- `decided_note text`

### `audit_log`
- `id bigserial pk`
- `actor uuid` — admin user id
- `action text not null` — e.g. `schedule.published`, `employee.created`
- `entity text not null`, `entity_id uuid`
- `diff jsonb`
- `created_at timestamptz default now()`

## Rules summary
| Code | Level | Description |
|---|---|---|
| `OVERLAPPING_SHIFTS` | block | Two shifts overlap on the same day for the same employee |
| `ON_TIME_OFF` | block | Shift falls inside an approved time-off range |
| `MAX_DAYS_EXCEEDED` | block | Employee assigned more than `max_days_per_week` days in the week |
| `BELOW_MIN_DAYS_OFF` | block | Days off in the week < `weekly_days_off` |
| `BELOW_COVERAGE` | warn | A weekday has fewer than `default_headcount` employees for a template |
| `ABOVE_HOUR_TARGET` | warn | Total hours > `weekly_hour_target` for the week |
| `PREFERRED_DAY_OFF_USED` | warn | Employee is scheduled on a `preferred_days_off` day |
| `ABOVE_BIWEEKLY_HOURS` | warn | Employee exceeds the hour cap across a 2-week pay sprint (default 80h) |

## Pay periods (config, not DB)
Pay sprints are two Mon–Sun weeks (14 days). Payday is the Friday after a sprint's
last Sunday. The sprint anchor Monday and the biweekly hour cap live in env
(`SPRINT_ANCHOR_MONDAY`, `BIWEEKLY_HOUR_CAP`), read via `src/lib/payroll-config.ts`;
the math is pure in `src/lib/scheduling/payroll.ts`. Time-off requests for a week
are "due" before that week's preceding Friday (`submissionCutoff`); late ones are
flagged (computed from `submitted_at`), not blocked.

## Indexes worth keeping in mind
- `shifts (schedule_id, employee_id, date)` — already covered above
- `shifts (date)` — for global "who's working today" queries
- `employees (location_id, active)` — admin lists
- `time_off_requests (employee_id, status)` — inbox filters
