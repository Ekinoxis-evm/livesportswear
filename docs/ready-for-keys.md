# Ready for keys — go-live checklist

The store-ops build (conversion app, goals, per-location admins, Resend auth) ships
"wired and waiting." Everything works with graceful empty states **before** the
external keys are connected, and lights up automatically once they are. This is the
order of operations to take it live.

## 1. Apply the migrations

Migrations `0009_conversion_goals_admin_scope.sql` and `0010_admin_scope_rls.sql`
must be applied to the Supabase project.

```bash
supabase link --project-ref "$SUPABASE_PROJECT_REF"
supabase db push          # applies 0009 + 0010
```

(Or apply each via the Supabase MCP `apply_migration`. The project pauses when idle —
unpause it in the dashboard first.) After applying, regenerate types and confirm they
match the hand-written ones:

```bash
supabase gen types typescript --linked > src/lib/supabase/types.ts
git diff --stat src/lib/supabase/types.ts   # expect no/minimal diff
```

## 2. Designate the master admin

The first admin account (no `app_metadata.admin_scope` claim) is the **master** admin
and sees every store. Set it once via the service role:

```sql
-- in Supabase SQL editor, on the auth user that should be master
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
where email = 'owner@liveactivewear.com';
```

Then invite per-store admins from **Settings → Admins** (they get
`admin_scope=location` + an `admin_locations` row and are isolated by RLS).

## 3. Email

**Auth emails (invite + password reset) use Supabase Auth's built-in email** — no
Resend needed, works out of the box. Admins can also **Set password** on an
employee (email-free onboarding/reset), so staff can be onboarded even with no
email configured.

**Resend is for app notifications only** — schedule published, daily Close-Day
report, time-off decision.

| Var | Purpose |
| --- | --- |
| `RESEND_API_KEY` | notification emails (schedule / report / time-off decision) |
| `SENDER_EMAIL_ADDRESS` | **must be an address on a verified Resend domain** |
| `REPLY_TO_EMAIL_ADDRESSES` | reply-to |
| `RESEND_DRY_RUN` | **set `false` in production** (true everywhere else) |
| `STORE_REPORT_EMAIL` | fallback for the daily Close-Day report before admins exist |

> **Verified-domain sender is required for delivery.** The default
> `onboarding@resend.dev` only delivers to the Resend account owner; verify a
> domain at resend.com/domains and point `SENDER_EMAIL_ADDRESS` at it (e.g.
> `noreply@yourdomain.com`). `sendSafe` logs the masked send outcome, so failures
> are visible in the runtime logs.

## 4. Shopify POS (sales / commission / day-report money) — when ready

Auth is the **client-credentials grant** from a Dev Dashboard app (admin-created
custom apps were retired Jan 2026). The app must live in the **same organization**
as the store and be installed on it, with Admin API scopes `read_orders` +
`read_all_orders` (staff attribution uses REST `order.user_id` + the order
timeline author — GraphQL `staffMember` needs `read_users`, which Shopify only
grants via support request). Set `SHOPIFY_STORE_DOMAIN`,
`SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET` (tokens are minted and cached
automatically; a legacy `SHOPIFY_ADMIN_TOKEN` still works as a direct override).
Then in **Settings → Shopify**, map each POS staff member to an employee. The
daily cron (`/api/cron/shopify-sync`) fills `monthly_sales` for the current and
previous month → commission, the dashboard **Sales vs Goal** card, and (next
step) the day-report money line. Conversion counts (`client_events`) are
employee-entered and already work without Shopify.

## 5. Meta Ads (ROAS) — optional

Set `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_API_VERSION` (`ads_read`). The
cron (`/api/cron/meta-sync`) fills `ad_insights` → Marketing page + dashboard **Ad
ROAS** card.

## 6. Cron

`CRON_SECRET` must be set; Vercel cron calls send `Authorization: Bearer $CRON_SECRET`.
Schedules: `meta-sync` and `shopify-sync` run daily (see `vercel.ts`).

## What works before any keys

- Employee invites + password reset (needs only Resend).
- Scheduling, publish, ICS, time-off with the Friday cutoff.
- The in-store conversion app: who's-working-today, swipe attended/sold/contact,
  live conversion %, Close Day → emailed report (money line shows "connect Shopify").
- Monthly goals entry; dashboard cards show real conversion and honest
  "connect keys" placeholders for sales/ROAS.
- Per-location admin isolation.
