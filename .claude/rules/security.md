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
  - An employee's email changes (rotation is mandatory).
- Public routes that accept a token MUST:
  1. Constant-time compare via the DB query (don't fetch all + compare in app code).
  2. Return `404`, not `401`, on miss (no token enumeration).

## Row-Level Security
- **Every table has RLS enabled. Default deny.**
- Admin reads/writes via authenticated Supabase Auth session. Policies grant access to authenticated users only.
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
