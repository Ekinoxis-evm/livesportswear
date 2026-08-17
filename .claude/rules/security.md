# Security

## Authentication
- Admin auth via Supabase Auth (email + password, optional magic link). One admin user in v1; schema allows more.
- Employees do NOT log in. They access their schedule via a per-employee magic URL: `/s/{magic_token}`.

## Magic tokens (employee URLs)
- 32 bytes from `crypto.randomBytes(32)`, base64url-encoded → 43 chars.
- Generated server-side at employee create; stored in plain text in `employees.magic_token` (it's a capability, not a credential).
- **Never log** the token. Never include in error messages. Never embed in admin URLs except via copy-to-clipboard action.
- Rotated when:
  - The admin explicitly rotates it (button in employee detail page).
  - An employee's email changes (rotation is mandatory) — including the
    self-service change in the portal (`changeOwnEmail`, `src/server/profile.ts`).
- Public routes that accept a token MUST:
  1. Constant-time compare via the DB query (don't fetch all + compare in app code).
  2. Return `404`, not `401`, on miss (no token enumeration).

## Store-week share tokens (0017)
- `locations.share_token`: 32-byte base64url capability for `/w/{token}/{week}`
  — the whole store's **published** week, read-only, no login. Same rules as
  magic tokens (never log, 404 on miss, DB-equality lookup). Generated at
  location create (`createLocation`) and backfilled by 0017. Rotation: not yet
  built — recreate via SQL if a link leaks.

## Attendance validation tokens (0015 — DROPPED 0050)
- The `attendance_validations` QR-token flow (peer entry/exit attestation) was
  removed when the kiosk became the only check-in surface, and the table was
  **dropped 2026-07-25 (migration 0050)**. No token surface remains.

## Row-Level Security
- **Every table has RLS enabled. Default deny.**
- **Hardening (0028):** the SECURITY DEFINER helper functions (`is_admin`,
  `admin_can_access_location`, `current_employee_id`, …) are NOT executable by
  `anon`/`public` — only `authenticated` + `service_role` (they power the RLS
  policies, which all target `authenticated`). `search_path` is pinned on
  `tg_set_updated_at`/`is_admin`/`is_master_admin`. The `avatars` bucket's
  listing policy was dropped (public-bucket object URLs don't need it).
  Leaked-password protection (HaveIBeenPwned) is ON — that's a Supabase Auth
  dashboard setting, not a migration.
- Floor/rewards tables follow the same posture: `floor_breaks` and
  `sales_contests` are admin-all + location-read with service-role-only
  writes; `employee_goals` is admin-all (via `employee_location`) + self-read.
- **Role-aware** (migration `0003`). Role comes from the JWT claim `app_metadata.role` (`admin` | `employee`), read by `public.is_admin()`. Helpers `public.current_employee_id()` / `public.current_location_id()` are `security definer` (bypass RLS to avoid policy recursion).
  - **Admin** (`is_admin()`): full CRUD on every table.
  - **Employee**: reads only their **own** `employees` row, their **own** `shifts` / `time_off_requests`, and their location's `schedules`; `locations` + `shift_templates` are readable by any authenticated user (not sensitive). Employees have **no write policy** on `employees` — profile/photo edits go through a service-role server action with controlled fields.
  - `employee_compensation` (hourly rate) and `audit_log` are **admin-only** — employees get no policy, so default-deny hides them entirely.
- The service-role client (`src/lib/supabase/service.ts`) bypasses RLS. Use it ONLY in:
  - Public token-based routes (after token verification)
  - Cron handlers (verified via `CRON_SECRET`)
  - Admin/employee server actions that need controlled cross-cutting writes (e.g. employee photo, audit log, invites)
- Never expose the service-role key to the client. It's `server-only` (enforce with `import "server-only"`).
- The service-role client (`src/lib/supabase/service.ts`) bypasses RLS. Use it ONLY in:
  - Public token-based routes (after token verification)
  - Cron handlers (verified via `CRON_SECRET`)
  - Server actions that explicitly need cross-tenant operations
- Never expose the service-role key to the client. It's `server-only` (enforce with `import "server-only"`).

## Secrets
- `.env.local` is gitignored. `.env.example` is the source of truth for required keys.
- `MAGIC_TOKEN_SECRET` (if we ever HMAC tokens), `CRON_SECRET`, and Supabase service-role go in Vercel env vars only.
- Never commit env files. **This repo is PUBLIC**, so a leak is instant and
  world-readable — treat `.gitignore` as necessary but not sufficient.
- **Pre-commit hook**: `.githooks/pre-commit` blocks staged env files, private
  key material, and secret-shaped content (Supabase JWT / `sbp_`, Resend `re_`,
  Shopify `shpat_`/`shpss_`, PEM blocks). It lives in the repo, not
  `.git/hooks/`, so it survives a fresh clone; `pnpm install` points git at it
  via the `prepare` script (`git config core.hooksPath .githooks`). It reports
  the file and the rule, never the matched value. `--no-verify` bypasses it.
  Patterns are anchored on a non-word boundary so `require_foo` doesn't read as
  a Resend key. *(Written 2026-08-05 — this line previously claimed a hook that
  did not exist.)*
- Keep `.env.local` at mode `600`; it holds the service-role key (bypasses all
  RLS), the Vercel token, the Shopify client secret and the Resend key.
- GitHub secret scanning + push protection are **free on public repos** and were
  disabled as of 2026-08-05 — enabling them adds the server-side net the hook
  can't provide (a hook only runs on machines that have it).

## Cron endpoints
- Every `/api/cron/*` route checks `Authorization: Bearer ${CRON_SECRET}`.
- Vercel cron headers include this automatically; failures return 401.

## CSP & headers
- Configured in `vercel.ts` `headers`. Lock down `frame-ancestors`, set `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- ICS feed responses: `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: private, no-cache`.

## PII
- Don't log full employee email or phone. Mask: `j***@liveactivewear.com` (`sendSafe`
  masks recipients before logging).
- Audit log captures the diff but not the magic token field.
- **Customer PII**: `client_events.customer_name` may be *rendered* to authorized
  surfaces (day report, admin Clients view, kiosk "Clients attended" list) but
  NEVER logged. **Email/phone are no longer captured on the kiosk (2026-07-25):**
  the recent-orders pick-list ships only `id` + `name`, and the finish/re-take
  flow stops writing `customer_email/_phone` — nothing read them, and Shopify owns
  contact (fetched directly, RLS-scoped, by the admin/portal client books). When
  passing customers to client components, pass only what's shown.
- **Kiosk thank-you WhatsApp (0052) — one deliberate, scoped exception.** To
  send the thank-you, `storeThankYouLink` resolves the client phone server-side
  (`fetchOrderById`) and returns a `wa.me` URL; that URL reaches the kiosk browser
  for this one send only. The phone is never stored, never logged, and never in
  the general order list. This is the minimal crossing a WhatsApp launch requires.

- **Changing who is an admin** (`setEmployeeAdmin`, 2026-07-25 fix): gated by
  `requireMasterAdmin` (like `inviteAdmin`/`removeAdmin`) — a location-scoped
  admin can no longer promote anyone. A promoted employee becomes a
  **location-scoped** admin (`admin_scope="location"`, mapped in `admin_locations`
  to their own store), never a master. Demote revokes the mapping. A missing
  `admin_scope` reads as master, so it must always be set explicitly.

## Report recipients & receiving (0039–0040)
- `store_report_recipients` writes: admin path is RLS-enforced via `createServerClient`
  (`src/server/report-recipients.ts`, `requireAdmin` + `accessibleLocationIds` check). The
  kiosk's `storeSendTestReport` (`src/server/store-floor.ts`) uses the **service client** but
  is location-scoped by the store JWT claim via `storeCtx()` — the location is never a client
  input. (The unused kiosk recipient add/remove/list actions were removed 2026-07-25; recipient
  editing goes through the shared `RecipientsManager`.) Same single-writer posture as the rest
  of the kiosk.
- **AI receiving extraction** (`src/lib/receiving-extract.ts`): uploaded arrival documents
  (PDF/photo) are sent to Anthropic (direct `ANTHROPIC_API_KEY`, or the Vercel AI Gateway) for
  line-item extraction — i.e. document contents leave our infra to a third-party model
  provider. That's inherent to the feature; keep it to arrival docs only. `ANTHROPIC_API_KEY`
  is server-only (`import "server-only"`), never exposed to the client. The `receiving-docs`
  storage bucket is private, read/written only via the service client in the receiving actions.
- **Kiosk counting (0058)**: employees count a New Stock arrival on the store iPad through
  `src/server/store-receiving.ts` — service-client actions gated by `requireStore()` and
  **re-scoped on every write** to the JWT's location AND a restock session that is actually in
  `status='counting'`. The kiosk can only write counted quantities / the counted tick and flip
  `counting → ready`; **matching to Shopify and the final additive push stay admin-only**
  (`requireAdmin`). Same single-writer posture as the floor: no store-JWT RLS policy on
  `inventory_counts`/`inventory_count_items`.

## Report resend (0065)
- `storeResendReport` (kiosk) is `requireStore()` + the **JWT's** location, and
  rejects a future date; `resendReport` (admin) is `requireAdmin` + the
  `accessibleLocationIds` check. Neither takes a destination — recipients always
  come from the stored `store_report_recipients` list, so no caller can mail the
  day's numbers somewhere it invented.
- **Deliberately NOT gated on being on shift + checked in**, unlike closing.
  That gate is what made five days of reports unrecoverable in August 2026, and
  a resend writes no new figures — it re-derives a day that already happened and
  mails a list the store already approved.
- A resend re-reads Shopify for that date, so it can surface money data for a
  past day; that is the same data the admin/kiosk already display for it.

## Kiosk reminders (0063)
- `store_reminders` is admin-managed (RLS admin-all, location-scoped); the acks
  table is admin-**read** only. The kiosk clears a due slot through
  `storeAckReminder` (`src/server/store-reminders.ts`) — a service-client action
  gated by `requireStore()` and **re-scoped to the JWT's location**, which
  refuses a reminder belonging to another store. No store-JWT policy exists on
  either table; same single-writer posture as the floor and receiving.
- The ack carries no employee and no PII — it records that a slot was cleared,
  nothing about who.

## Client data (0042–0048)
- `customer_origin` is **attribution only** — no name, email or phone. Shopify
  owns client identity; `country_iso` (a 2-letter code) is the one derived
  attribute stored, for aggregate reporting.
- **A rep reads only their own clients.** 0043 adds an employee SELECT policy
  scoped to their `staff_id`. The portal client profile takes a customer id in
  the URL, so it **re-checks `staff_id` server-side and 404s on a miss** —
  never "not allowed", which would confirm the client exists.
- Reps see full contact details (WhatsApp/email) **for clients in their own
  book only**. This deliberately reverses the earlier stance of keeping contact
  out of the portal; the scope is what makes it safe. Still never logged.
- **Kiosk report sends** narrow recipients against the stored list server-side
  (`narrowRecipients`) — a kiosk cannot email the day's numbers to an address
  it invents.
- **Re-take** is scoped to the employee, the store JWT's location, and **today's
  business date**, so a kiosk left open overnight cannot rewrite a closed day.

## Store screen accounts (0019)
- A third role, `app_metadata.role = "store"`: one **shared per-location kiosk
  login** (`app_metadata.location_id` claim, no `employees` row, no
  `auth_user_id` link). Created by an admin from the Locations page
  (`createStoreAccount`, `src/server/store-accounts.ts`); password shown once.
- `requireStore()` (`src/lib/auth.ts`) gates `/store/*` (also enforced in
  `src/proxy.ts`). The RLS helpers (`current_employee_id()` etc.) return NULL
  for a store JWT — by design the kiosk only works through **service-client
  server actions** (`src/server/store-floor.ts`) that validate the target
  employee belongs to the claim's location.
- **Kiosk PIN**: entry/exit taps require the employee's 4-digit PIN
  (`employees.kiosk_pin_hash`, sha256 salted with the employee id). It's a
  floor-speed control, not a credential — never accept it for login. Queue
  actions (take client, sold/no-sale) are deliberately one-tap.
- Kiosk-made entry/exit stamps are recorded **validated** (`*_validated_at`
  set, `*_validated_by` null): the device standing in the store plus the PIN is
  the attestation. The kiosk is the ONLY check-in surface — the employee-portal
  floor UI and the QR peer-validation flow were removed with it
  (`attendance_validations` is legacy/read-only history now).
- **Face photos are gone (2026-08-17).** Entry/exit capture, the private
  `checkin-photos` bucket, its 30-day retention cron and all 193 stored images
  were removed; `floor_checkins.entry_photo_path`/`exit_photo_path` are nulled
  and no longer written (columns kept, unused). It was never a large cost — 4 MB
  and self-limiting — but it was a camera step at the door on every arrival and
  departure producing evidence nobody read. **Know what this gives up:** the
  photo was the only thing tying a PIN tap to a face, so a shared PIN can now
  clock in a colleague and nothing in the data would show it. The PIN on the
  shop's own iPad is the whole attestation, and these stamps feed worked hours.

## Roles & accounts
- Admins and employees are both Supabase Auth users, distinguished by `app_metadata.role`. The admin claim is set out-of-band (service role). Employees get accounts via the admin "Invite to portal" action (`src/server/employee-accounts.ts`), which creates the auth user with `role=employee` + `employee_id` and links `employees.auth_user_id`.
- `requireAdmin()` / `requireEmployee()` (`src/lib/auth.ts`) gate server code; `src/proxy.ts` gates `/admin` (admin only) and `/portal` (any authenticated) by the JWT claim — no DB call.
- Changing an auth user's role requires updating `app_metadata`; the change lands on the next token refresh / re-login.
- **Admin scope (0009).** Admins are either **master** or **location-scoped**.
  A master admin has `app_metadata.role=admin` with no `admin_scope` claim (or
  `admin_scope='master'`) and sees every location — `public.is_master_admin()` is
  `true`. A scoped admin has `admin_scope='location'` and is limited to the
  locations mapped in `public.admin_locations`; `public.admin_can_access_location(loc)`
  (`security definer`) is the gate. New tables (`client_events`, `store_day_closes`,
  `store_goals`) enforce this already; the existing tables' admin policies move from
  bare `is_admin()` to `admin_can_access_location()` in migration `0010`. Back-compat:
  the original single admin (no `admin_scope` claim) is treated as master, so access
  never narrows by accident.
- **Onboarding is password-based (0016).** Invites (employee
  `inviteEmployee` / admin `inviteAdmin`) and `setEmployeePassword` all create
  the account with a generated temporary password (`src/lib/temp-password.ts`),
  email it via Resend (`CredentialsEmail`), and show it to the admin. Supabase's
  `inviteUserByEmail` was dropped (unreliable delivery, empty-looking template).
  Password reset (`resetPasswordForEmail`, forgot-password page) still uses
  Supabase's built-in email as a self-serve fallback.
- **Stored temp credentials.** The generated password is kept in
  `employee_credentials` (default-deny RLS, service-role only) and shown on the
  admin employee page until the employee changes it — `changeOwnPassword`
  (portal) or the reset-password page deletes the row. Only the *temporary*
  password is ever stored; a self-chosen password never is. **Admins get the same
  via `admin_credentials` (0060)** — keyed on the auth user id (admins have no
  `employees` row), so a master admin can re-copy or **reset** an admin's password
  from Settings (`inviteAdmin`/`resetAdminPassword` in `src/server/admins.ts`, both
  `requireMasterAdmin`). Same default-deny/service-role posture.
- **Creating master admins (0060).** `inviteAdmin` now takes a `master` flag: a
  master gets `app_metadata.admin_scope="master"` (explicit — a missing scope
  reads as master, but we always set it) and **no** `admin_locations` rows (all
  stores); a scoped admin keeps `"location"` + its rows. Master-only
  (`requireMasterAdmin`), so only a master can mint another master — the one way
  to create masters from the UI (previously out-of-band only).
- **Sender domain — resolved.** These notes used to warn that mail only reached
  the Resend account owner because the sender was the default
  `onboarding@resend.dev`. That stopped being true on 2026-07-21: **`ekinoxis.xyz`
  is verified** (sending enabled) and `SENDER_EMAIL_ADDRESS` is
  `reports@ekinoxis.xyz`. Confirmed live 2026-08-07 — a close-day report
  delivered to seven real staff addresses across `liveactivewear.com` and
  `liveoficial.com.br`. Credential emails reach staff directly; the admin no
  longer has to hand the password over by hand (they still can, from Settings).
- **Deliverability is shared, and something else is spending it.** Other projects
  send from the same `ekinoxis.xyz` domain, and as of 2026-08-07 a daily
  `SWRFM Daily` job was **hard-bouncing every day** (recipients
  `hola@ekinoxis.xyz` — the domain has receiving DISABLED — and
  `ruben@swrfmarkets.com`, plural, where the address that delivers is
  `swrfmarket.com`). Repeated hard bounces degrade the domain's reputation for
  **every** sender on it, including this store's daily report. That job is in
  another repo; fixing it is not this codebase's job, but knowing it can silently
  push the store's report into spam is.
- **Resend is for app notifications only** — schedule published, daily Close-Day
  report, time-off decision (`src/lib/resend.ts` `sendSafe`, dry-run aware).
  `sendSafe` logs the masked send outcome. Note the **Resend MCP is a separate
  path that does NOT honour `RESEND_DRY_RUN`** — it sends real mail through the
  live account.

## Known v1 limitations (harden before changing these assumptions)
- **Public endpoints are not rate-limited.** `submitTimeOff` and the `/s/[token]` routes rely on the 32-byte token's unguessability and bounded date ranges. Add a Vercel Firewall / token-bucket rule before exposing widely.
- Audit log currently records `schedule.published` and `time_off.decided`; other admin mutations are not yet audited.
