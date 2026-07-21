# Data Model — Source of Truth

> Every schema decision lives here. If you change a table, update this file in the same PR. Authoritative SQL lives in `supabase/migrations/`.

> **The sales metric everywhere is NET sales** — Shopify `current_subtotal_price`: after
> discounts and refunds, excluding taxes and shipping (`src/lib/shopify.ts`). This is what
> `monthly_sales.amount`, contest standings, range views, and dashboards all mean. (Note:
> `store_day_closes.shopify_sales` snapshots taken before 2026-07-16 are tax-inclusive.)
> Since 0031 the decomposition rides alongside wherever sales are shown:
> **gross − discounts − returns = net** (`src/lib/sales-breakdown.ts`; gross =
> `total_line_items_price`, discounts = `total_discounts`, returns =
> `subtotal_price − current_subtotal_price`; identity verified live).

## Tables

### `locations`
A physical store.
- `id uuid pk`
- `name text not null` — display name, e.g. "Miami Lincoln Road"
- `slug text not null unique` — URL-safe
- `address text` — street line
- `city text`, `state text`, `country text`, `postal_code text` — structured address (0013)
- `timezone text not null` — IANA, e.g. `America/New_York`. The authoritative
  reference for all store-local "today"/week math (`businessDate(tz)`).
- `color text` — hex, used for badges in admin UI
- `share_token text unique` (added 0017) — capability token for the public
  store-week page `/w/{token}/{week}` (all employees' published shifts,
  read-only). Same handling rules as employee magic tokens.
- `active boolean default true`
- `created_at, updated_at`

### `employees`
A worker. Always belongs to one location in v1 (no multi-location reps yet).
- `id uuid pk`
- `location_id uuid fk -> locations`
- `name text not null`
- `email text not null unique`
- `phone text`
- `avatar_color text` — from the app palette (`lib/avatar-palette.ts`); never null since 0038 backfill + create-time default
- `role text not null` — enum: `sales_rep | shift_lead | store_manager`
- `weekly_hour_target int not null default 40`
- `max_days_per_week int not null default 5`        — hard rule
- `weekly_days_off int not null default 2`          — hard rule
- `hire_date date`
- `active boolean default true`
- `magic_token text not null unique`                — see security.md
- `auth_user_id uuid unique fk -> auth.users`       — set when invited to the portal (0003)
- `avatar_url text`                                 — profile photo (Supabase Storage `avatars` bucket)
- `kiosk_pin_hash text` (added 0019)                — sha256(employee_id:pin); confirms
  identity for entry/exit taps on the shared store screen (see security.md "Store
  screen accounts"). Set via `setOwnKioskPin` (portal) / `setEmployeeKioskPin` (admin).
- `shopify_staff_id text`                            — maps this employee to their Shopify
  POS staff account (REST `order.user_id` / GraphQL StaffMember tail; compared via
  `normalizeStaffId`, `src/lib/shopify-range.ts`). Set in the admin Shopify settings panel.
  Drives all per-staff sales attribution: monthly sync, the sales-period ranking, and the
  kiosk "today's orders" per-seller avg ticket (`src/lib/orders-today.ts`). Unmapped reps
  don't appear in attributed sales (surfaced as an `unmappedCount`).
- `created_at, updated_at`

### `employee_compensation` (added 0003)
Private, admin-only pay data — kept separate from `employees` so RLS default-deny hides it from the employee entirely (no column-level RLS).
- `employee_id uuid pk fk -> employees`
- `hourly_rate numeric(10,2)`
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

### `client_events` (added 0009)
In-store conversion engine — one row per customer an employee attends. Sales
revenue stays Shopify-sourced (`monthly_sales`); this table is the **conversion**
layer (counts), not money.
- `id uuid pk`
- `location_id uuid fk -> locations`
- `employee_id uuid fk -> employees`
- `business_date date not null` — location-local day (for daily grouping/close)
- `attended_at timestamptz not null default now()` — when the rep marked it
- `sold boolean not null default false`
- `return_type text` (added 0041; check `return`|`exchange`|`both`) — a
  **report-only label** on a return event, set from the kiosk finish wizard.
  Does NOT change metrics: conversion/returns still key on `kind`
  (`src/lib/conversion.ts`), which stays `walkin`|`return`. `both` implies
  `sold=true` (returned + bought more); `return`/`exchange` imply `sold=false`.
- `got_contact boolean not null default false`
- `shopify_order_id/_name`, `order_total`, `shopify_customer_id`,
  `customer_name/_email/_phone` (added 0037) — a sold walk-in optionally
  links the real Shopify order + its customer (picked from the last orders
  on the kiosk). The client-history seed, read by `/admin/clients` (per
  customer: latest contact, the rep who captured it = first got_contact
  event, visits, linked totals; live Shopify orders/spend via
  `fetchCustomersByIds`). PII: stays in the DB under the existing RLS;
  NEVER log customer contact. Partial index
  `(location_id, shopify_customer_id)` powers the grouping.
  **Next phase (not built):** historical attribution for customers created
  before linking, via each customer's first order's staff `user_id`.
- index `(location_id, business_date)`, `(employee_id, business_date)`

### `store_day_closes` (added 0009)
End-of-day snapshot per `(location, business_date)` produced by the "Close day"
action; drives the daily email report. `shopify_sales` is filled once Shopify POS
keys are connected.
- `id uuid pk`
- `location_id uuid fk -> locations`
- `business_date date not null`
- `closed_by uuid fk -> employees (on delete set null)`
- `closed_at timestamptz not null default now()`
- `attended_count int`, `sold_count int`, `contact_count int`
- `shopify_sales numeric(12,2)` (nullable), `currency text` — snapshotted from
  Shopify at close time (`closeDay`); null if Shopify was unreachable/unconfigured
- `cash_sales numeric` (added 0025) — cash-in-register snapshot at close
- `gross_sales`, `discounts`, `returns_value numeric(12,2)` (added 0031) —
  net-sales decomposition at close; null on days closed before 0031
- `unique (location_id, business_date)`

### `store_report_recipients` (added 0039)
The **editable** recipient list for a store's daily Close-Day report and the sole
source of truth for `reportRecipients` (`src/server/conversion-core.ts`) — the
`STORE_REPORT_EMAIL` env fallback applies only when the list is empty. Seeded at
migration time from each location's current admin emails (master admins
everywhere; scoped admins for their mapped locations — the rule
`adminReportEmails` applied), then freely edited: an admin adds outside addresses
(owner/accountant) and can remove **any** recipient, including the seeded admins.
New admins added later do NOT auto-appear (the list owns membership). Managed from
the admin Performance→Daily page (add/remove + a "Send test report" button that
emails the current list with a `[TEST]` subject and writes no close row).
- `id uuid pk`
- `location_id uuid fk -> locations (on delete cascade)`
- `email text not null`, `created_by uuid` (admin user), `created_at`
- unique index `(location_id, lower(email))` (case-insensitive), index `(location_id)`
- RLS: admin-only, location-scoped via `admin_can_access_location(location_id)`.

### `store_goals` (added 0009)
Monthly store sales target — 12 months/year per location. Surfaced as progress on
the admin dashboard.
- `location_id uuid fk -> locations`
- `year int not null`, `month int not null check (1..12)`
- `goal_amount numeric(12,2) not null default 0`, `currency text`
- `tiers jsonb` (added 0012) — per store/month commission tiers
  `[{min_sales, rate}]`; when null, commission falls back to the global
  `commission_config.tiers`. Set via `setStoreMonth` (goal + tiers together).
  Semantics: thresholds are band boundaries — the first rate applies below the
  first threshold, the next rate from there up, and the top rate continues
  beyond the last threshold (`lib/commission.ts` `commissionFor`).
- `created_at, updated_at`
- `primary key (location_id, year, month)`

### `admin_locations` (added 0009)
Maps a **scoped** admin (`app_metadata.admin_scope = 'location'`) to the
location(s) they may manage. A **master** admin (no `admin_scope` claim, or
`'master'`) has access to every location. See security.md.
- `admin_user_id uuid fk -> auth.users`
- `location_id uuid fk -> locations`
- `primary key (admin_user_id, location_id)`

### `floor_days` (added 0011)
Marks a store day open for the rotation queue ("up system").
- `location_id uuid`, `business_date date` — `primary key`
- `opened_by uuid fk -> employees (on delete set null)`, `opened_at timestamptz`

### `floor_checkins` (added 0011)
One row per employee present on the floor today. Drives who is "up next":
since 0036 the line is FIFO by `available_since` — first to finish is first
up. `available_since` is stamped at check-in and on finishing a WALK-IN;
returns, undo, back-to-line, and break-end keep the old stamp (they never
cost the spot). `rotation_count` still increments per walk-in finish but is
display-only ("N turns today"). See `src/lib/floor-queue.ts`
(`orderFloor`/`upNext`) and `src/server/floor-core.ts`.
- `id uuid pk`
- `location_id uuid fk -> locations`, `employee_id uuid fk -> employees`
- `business_date date not null`
- `arrived_at timestamptz not null default now()` — the recorded arrival time
- `left_at timestamptz` (null = on the floor)
- `status text` — `available | attending`
- `rotation_count int not null default 0` — display-only since 0036
- `available_since timestamptz` (added 0036) — the FIFO ordering key; null
  on pre-0036 rows (readers fall back to `arrived_at`)
- `bumped_at timestamptz` (added 0014) — manual "make up next" override by a
  lead; non-null puts the member at the front of the line (latest bump wins),
  cleared when they take a customer or re-check-in
- `entry_validated_at/by`, `exit_validated_at/by`, `entry_self`, `exit_self`
  (added 0015) — attestation of arrival/departure. Since the store kiosk
  (0019) became the only check-in surface, stamps are written validated
  (device + PIN); the earlier peer/QR flow (`attendance_validations`) is
  legacy history. Hours math stays pure in `src/lib/attendance.ts`
  (`workedHours`, `stampStatus`).
- `entry_photo_path`, `exit_photo_path` (added 0020) — face-photo evidence in
  the private `checkin-photos` bucket, 30-day retention (photo-retention cron)
- `attending_count`, `attending_return_count`, `manual_pos` (added 0022) —
  multi-client counters + kiosk drag order (see floor-queue.ts precedence)
- `unique (location_id, business_date, employee_id)`
- RLS: admin location-scoped; employees at the location can READ the store's
  floor (shared shop-floor data). All writes are service-role only via the
  kiosk server actions since 0023 (employee write policies dropped — a portal
  JWT must not be able to forge validated stamps or counters).

### `employee_credentials` (added 0016)
Admin-issued temporary password, retrievable on the employee page until the
employee changes it (then the row is deleted — see `changeOwnPassword` /
`clearMyStoredCredential` in `src/server/profile.ts`). Deliberate plaintext for
a *temporary* credential; see security.md.
- `employee_id uuid pk fk -> employees (on delete cascade)`
- `temp_password text not null`
- `set_by uuid` — admin user id
- `set_at timestamptz default now()`
- RLS: enabled with **no policies** (default deny) — read/written only by
  admin-gated server code via the service client.

### `floor_breaks` (added 0025)
An on-floor employee steps off the line without checking out. Tracked only —
worked hours stay checkout − checkin; the 30-min daily budget is flagged
(`lib/breaks.ts`), never enforced. Multiple breaks per day; `ended_at` null =
ongoing. A partial unique index allows at most ONE open break per employee per
day. On break = removed from the queue, rotation position kept.
- `id uuid pk`
- `location_id uuid fk -> locations`, `employee_id uuid fk -> employees`
- `business_date date not null`
- `started_at timestamptz not null default now()`, `ended_at timestamptz`
- index `(location_id, business_date)`; partial unique `(location, date, employee) where ended_at is null`
- RLS: admins full via `admin_can_access_location`; location JWTs read-only;
  all writes via the PIN-gated kiosk actions (`src/server/store-floor.ts`).

### `sales_contests` (added 0026; extended 0029, 0030)
Per-location sales contests ("rewards"). Standings math is pure in
`src/lib/rewards.ts`; per-rep amounts come live from Shopify over the contest
window (NET sales).
- `id uuid pk`, `location_id uuid fk -> locations`
- `name text`, `start_date date`, `end_date date` (inclusive; check end >= start)
- `store_threshold numeric(14,2)` — the store gate when `goal_source='custom'`
- `goal_source text ('custom'|'monthly')` (0029) — `monthly` gates on the END
  date's month: that whole month's `monthly_sales` vs `store_goals.goal_amount`
- `personal_source text ('custom'|'monthly')` (0030) — where the personal-goal
  condition measures: targets typed into the contest (window) or each rep's
  `employee_goals` for the end month
- `personal_goals jsonb` (0029) — custom mode: `{employee_id: amount}`
- `prizes jsonb` — **v3 shape** (0030): a flat list of prizes, each
  `{items: PrizeItem[], conditions: {position|null, min_sales|null,
  requires_store_goal, requires_personal_goal}}`. `position: null` = won by
  EVERY rep meeting the rest. Items are pure descriptions (cash amount /
  clothing garments+qty / other label). `asPrizes` coerces the older v1/v2
  shapes defensively.
- `results jsonb` — immutable final snapshot written once after `end_date`
  (daily cron + admin-view fallback); per rep `{prizes: string[], won}`
- RLS: admin-all via location; employees read their location's contests;
  kiosk reads via service client.

### `employee_goals` (added 0030)
A rep's monthly sales target — mirror of `store_goals`, configured in the
"Personal goals" card on Sales & Rewards setup. Contests with
`personal_source='monthly'` measure each rep's end-month `monthly_sales`
against it.
- `employee_id uuid fk -> employees`, `year int`, `month int check (1..12)`
- `goal_amount numeric(12,2) not null default 0`
- `primary key (employee_id, year, month)`
- RLS: admin-all via `admin_can_access_location(employee_location(employee_id))`;
  employees read their own rows.

### `monthly_sales` (added 0004; breakdown columns 0031)
One row per (employee, month): the rep's attributed NET sales, synced from
Shopify (`runShopifySync` — cron + admin button) or entered manually.
- `employee_id uuid fk -> employees`, `month text 'YYYY-MM'`, unique together
- `amount numeric(14,2)` — NET sales (THE metric; commission + contests read this)
- `gross_amount`, `discounts_amount`, `returns_amount numeric(14,2)` (0031,
  nullable) — the decomposition; null on months synced before 0031 until re-synced
- `source text ('manual'|'shopify')`

### `inventory_counts` + `inventory_count_items` (added 0032)
Physical inventory counts, admin-only (`/admin/inventory`): scan barcodes on
the floor (external HID scanner or camera `BarcodeDetector`), tally per
variant, and compare against Shopify's `inventoryQuantity` at finalize.
Scans go through a confirm card by default (`peekBarcode` resolves the
product, admin sets a qty and confirms); a "Confirm each scan" toggle
restores instant +1 for fast rack scanning. UI label for Shopify's stock is
"In Shopify" (column `expected` internally). Math
is pure in `src/lib/inventory-count.ts`; Shopify lookups in
`lookupVariantByBarcode` / `fetchAllTrackedVariants` (`src/lib/shopify.ts`).
- `inventory_counts`: `id`, `location_id fk`, `status ('open'|'final')`,
  `kind ('count'|'restock')` (0040, default `'count'`), `note`, `started_by`
  (admin user), `started_at`, `finalized_at`, `expected_units`,
  `counted_units` (snapshotted at finalize), `document_path` (0040, restock
  only — the uploaded arrival doc in the private `receiving-docs` bucket).
  Partial unique index: ONE open session per **(location, kind)** (0040 — so a
  Counting and a New Stock session can be open at once).
- `inventory_count_items`: `count_id fk cascade`, `barcode`, `sku`,
  `product_title`, `product_type` (Shopify productType, added 0035; null on
  older rows), `variant_title`, `qty`, `expected` (Shopify qty at first
  scan; finalize sweeps the catalog and inserts qty-0 rows for unscanned
  stock), `doc_qty` (0040, restock only — what the arrival document said
  arrived; `qty` = physically verified arrived), `unknown` (barcode not in
  catalog). `unique (count_id, barcode)`. The count screen groups by
  `product_type` (category chips) and paginates 25/page.
- RLS: admin-only via `admin_can_access_location` (items via join to the
  parent count); no employee/kiosk policies.

**New Stock / receiving mode (0040)** — `kind='restock'`. The opposite of a
blind Counting: a shipment *arrives* with a supplier document and is **added**
to current stock (`new on-hand = current + arrived`), never replacing it.
Flow (`src/server/receiving.ts` + `src/lib/receiving.ts`, UI
`src/components/inventory/receive-screen.tsx`): upload the arrival doc → extract
line items (CSV/Excel via `papaparse` + `mapCsvRows`; PDF/photo via a Claude
vision model through the Vercel AI Gateway, `src/lib/receiving-extract.ts`,
`AI_GATEWAY_API_KEY`/`RECEIVING_MODEL`) → match to Shopify by barcode then SKU
(`lookupVariantByBarcode`/`lookupVariantBySku`) → physically scan to verify
(reuses `scanBarcode`/`adjustItem`) → preview table (current · arrived · new) →
`receiveStock` re-reads *fresh* on-hand, writes `onHand + arrived` via
`setOnHandQuantities` (gated on `write_inventory`), bumps `store_inventory`, and
finalizes. Unmatched lines are flagged for manual match (`matchUnknownItem`) or
skipped. Extraction math is pure/tested (`tests/receiving.spec.ts`).

### `store_inventory` (added 0033)
The store's own inventory book — one row per (location, barcode) holding OUR
counted truth. Each `finalizeCount` REPLACES the book rows for that store
(upsert on `(location_id, barcode)`, zeros included — a total count
establishes zeros). `shopify_qty` = what Shopify believed at count time
(drift stays visible on `/admin/inventory/book`).
- `location_id fk`, `barcode`, `unique (location_id, barcode)`
- `sku`, `product_title`, `product_type` (0035), `variant_title`, `qty`
  (our truth), `shopify_qty`, `unknown`, `counted_at`,
  `count_id fk (on delete set null)`
- RLS: admin-only via `admin_can_access_location`.
- Corrections flow back to Shopify only through the staged push flow
  (`shopify_push_drafts`, below) — never directly. A successful apply also
  refreshes `shopify_qty` to the written value.

### `shopify_push_drafts` + `shopify_push_draft_items` (added 0034)
The staged Shopify update (`/admin/inventory/push`): the book is diffed
against Shopify's CURRENT on-hand into a reviewable DRAFT; an admin reviews
(exclude rows, CSV), then writes via `inventorySetOnHandQuantities` (reason
`correction`). Diff math is pure in `src/lib/inventory-push.ts`
(`buildPushPlan`); actions in `src/server/inventory-push.ts`.
- `shopify_push_drafts`: `id`, `location_id fk`, `status
  ('draft'|'applied'|'discarded')`, `shopify_location_id/_name` (resolved at
  build; exactly ONE active Shopify location supported — mapping deferred),
  `created_by`, tallies `book_items` / `in_sync_items` / `skipped_unknown` /
  `skipped_no_variant` (invariant: items + these = book_items),
  `applied_at/by`, `discarded_at`. Partial unique: ONE `status='draft'` per
  location.
- `shopify_push_draft_items`: only the DIFFERENCES (`delta != 0`, writable):
  `draft_id fk cascade`, `barcode`, `sku`, titles, `inventory_item_id`,
  `book_qty`, `shopify_qty` (fresh on-hand at build), `delta`, `excluded`,
  `apply_status ('written'|'failed')` + `apply_error` (per-row write
  outcomes; retry re-runs only non-written rows). `unique (draft_id, barcode)`.
- Staleness: a draft with `max(store_inventory.counted_at) > created_at` is
  stale — banner + hard server-side block on apply.
- Apply is double-gated: UI button disabled AND `applyPushDraft` re-checks
  `write_inventory` via `currentAppInstallation.accessScopes` server-side.
  The scope must be added to the custom app in the Shopify admin (token had
  read_inventory only as of 2026-07-17).
- RLS: admin-only via `admin_can_access_location` (items via exists-join to
  the parent draft); no employee/kiosk policies.

### `attendance_validations` (added 0015 — LEGACY since 0019)

> No longer written: check-ins moved to the store kiosk, whose stamps are
> validated directly. Kept for historical rows; drop in a future migration.

One-time QR tokens for entry/exit attestation (audit trail). The employee's
Today card shows a QR encoding `/portal/validate/{token}`; an active coworker
at the store opens it and confirms (`validateAttendance`, `src/server/floor.ts`).
- `id uuid pk`
- `checkin_id uuid fk -> floor_checkins (on delete cascade)`
- `kind text` — `entry | exit`
- `token text not null unique` — 32-byte base64url (`generateMagicToken()`);
  same handling rules as employee magic tokens (see security.md)
- `created_at`, `used_at timestamptz`, `validated_by uuid fk -> employees`
- `unique (checkin_id, kind)` — re-marking rotates the token
- RLS: select only (admin via location join + same-location employees); all
  writes via service-client server actions.

> RLS helpers (0009): `is_master_admin()`, `admin_can_access_location(loc)`
> (`security definer`). New tables are already location-scoped; the existing
> tables' admin policies switch from bare `is_admin()` to
> `admin_can_access_location()` in a later migration (Phase F).

## Rules summary
| Code | Level | Description |
|---|---|---|
| `OVERLAPPING_SHIFTS` | block | Two shifts overlap on the same day for the same employee |
| `ON_TIME_OFF` | block | Shift falls inside an approved time-off range |
| `MAX_DAYS_EXCEEDED` | block | Employee assigned more than `max_days_per_week` days in the week |
| `BELOW_MIN_DAYS_OFF` | block | Days off in the week < `weekly_days_off` |
| `BELOW_COVERAGE` | warn | A weekday has fewer than `default_headcount` employees for a template |
| `ABOVE_HOUR_TARGET` | warn | Total hours > `weekly_hour_target` for the week |
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
