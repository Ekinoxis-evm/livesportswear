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

## Attendance validation tokens (0015)
- `attendance_validations.token` follows the same rules as employee magic
  tokens: 32-byte base64url, never logged, never echoed in errors (`validateAttendance`
  returns a generic "no longer valid" message — no token enumeration).
- Scoped tighter than magic tokens: single-use (`used_at`), bound to one
  check-in + kind, only meaningful to a signed-in employee at the same store on
  the same business date, and rotated every time the employee re-marks
  entry/exit.

## Row-Level Security
- **Every table has RLS enabled. Default deny.**
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
- Never commit env files. The pre-commit hook greps for likely secrets.

## Cron endpoints
- Every `/api/cron/*` route checks `Authorization: Bearer ${CRON_SECRET}`.
- Vercel cron headers include this automatically; failures return 401.

## CSP & headers
- Configured in `vercel.ts` `headers`. Lock down `frame-ancestors`, set `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- ICS feed responses: `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: private, no-cache`.

## PII
- Don't log full employee email or phone. Mask: `j***@liveactivewear.com`.
- Audit log captures the diff but not the magic token field.

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
  password is ever stored; a self-chosen password never is.
- **Credential email delivery caveat:** Resend on the default
  `onboarding@resend.dev` sender only delivers to the Resend account owner.
  Verify the company domain in Resend and point `SENDER_EMAIL_ADDRESS` at it for
  staff-wide delivery; until then the admin hands the password over from the UI.
- **Resend is for app notifications only** — schedule published, daily Close-Day
  report, time-off decision (`src/lib/resend.ts` `sendSafe`, dry-run aware).
  Delivery to arbitrary recipients requires a **verified domain** sender
  (`SENDER_EMAIL_ADDRESS`); the default `onboarding@resend.dev` only reaches the
  Resend account owner. `sendSafe` logs the masked send outcome.

## Known v1 limitations (harden before changing these assumptions)
- **Public endpoints are not rate-limited.** `submitTimeOff` and the `/s/[token]` routes rely on the 32-byte token's unguessability and bounded date ranges. Add a Vercel Firewall / token-bucket rule before exposing widely.
- Audit log currently records `schedule.published` and `time_off.decided`; other admin mutations are not yet audited.
