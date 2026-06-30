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

## 3. Resend (auth + reports) — required

| Var | Purpose |
| --- | --- |
| `RESEND_API_KEY` | invite, password-reset, schedule, time-off, daily report emails |
| `SENDER_EMAIL_ADDRESS` | verified sender on your domain |
| `REPLY_TO_EMAIL_ADDRESSES` | reply-to |
| `RESEND_DRY_RUN` | **set `false` in production** (true everywhere else) |
| `STORE_REPORT_EMAIL` | fallback for the daily Close-Day report before admins exist |

Invite + password-reset links are generated server-side (`generateLink`) and sent
through Resend — Supabase's built-in SMTP is **not** used.

## 4. Shopify POS (sales / commission / day-report money) — when ready

Set `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_API_VERSION` (scopes:
`read_orders`, `read_users`). Then in **Settings → Shopify**, map each POS staff
member to an employee. The daily cron (`/api/cron/shopify-sync`) fills `monthly_sales`
→ commission, the dashboard **Sales vs Goal** card, and (next step) the day-report
money line. Conversion counts (`client_events`) are employee-entered and already work
without Shopify.

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
