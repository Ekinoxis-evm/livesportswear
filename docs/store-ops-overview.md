# LIVE! Store-Ops — what was asked & what shipped

A consolidated map of everything requested in this build and its status. The app
went from a scheduling tool to a full store-operations app for **Lincoln Road** +
**International Mall**, wired to light up the moment Shopify POS / Meta keys connect.

## Locked decisions (the spine)
1. **Sales = Shopify POS truth.** Revenue & commission stay Shopify-sourced
   (`monthly_sales`). The employee app tracks **conversion only** (counts), never money.
2. **Auth emails via Resend** (invite + reset), admin-managed, no self-signup.
3. **Per-location admin isolation** — master admin sees all; store admins are scoped.
4. Everything ships "ready for the keys" with honest empty states.

---

## Feature map

### 1. Employee daily app — the shop floor  *(the headline)*
- **Rotation queue / "up system"** (`/portal/today`): a lead **opens the day**;
  employees **check in in arrival order** (arrival time recorded); the queue shows
  **Up next → waiting line → with a client**.
- Whoever is up taps **Take client**; when the customer leaves they mark **No sale**
  or **Sold → Got contact?** — which records the conversion at that moment and drops
  them to the **back of the line**.
- **14:30–17:30 overlap** handled by manual check-in / check-out.
- Live **conversion metrics** (store + you + team) and **Close day → emailed report**.
- **PWA**: installable, standalone, bottom nav.
- Files: `src/lib/floor-queue.ts` (pure, tested), `src/server/floor.ts`,
  `src/components/portal/floor-board.tsx`, `src/lib/conversion.ts`.
- Authorization enforced server-side (leads manage; employees self-mark).

### 2. Employee portal — schedule
- **Weekly calendar** with a clear **My week ⇄ Store** switch, today highlighted,
  off-days shown, per-shift **+ Google**, whole-week **Subscribe** (ICS), and a
  **Request day off** dialog (Friday-cutoff enforced).

### 3. Admin — scheduling
- **AM/PM shift board** (default): Mon–Sun with **Morning / Evening** rows
  (canonical hours 09:30–17:30 / 14:30–22:30, `src/lib/shift-slots.ts`); just drop
  employees into a slot — **one tap, hours predefined**. Works with zero templates.
- **By person** grid toggle; both show **day-off requests in red** (great on Next
  week). Quick-add and the edit sheet both offer **Morning / Evening / Custom**.
- **This week / Next week** tabs; pending day-off requests surfaced for the week.
- **Templates** section removed from nav (AM/PM is now canonical).

### 4. Admin — goals & metrics
- **Monthly sales goals** per store (12 months) in Settings.
- Dashboard **Sales vs Goal / Conversion / Ad ROAS** cards — graceful "connect keys"
  states until data flows.

### 5. Accounts, auth & admins
- **Invite + password reset via Resend** (branded invite email with app summary,
  what-you-can-do list, and a **sign-in link**).
- Create-employee form trimmed (preferred-days-off dropped — days off are weekly).
- **Per-location admins**: master can invite/scope/remove store admins (Settings →
  Admins); RLS isolates each store's data.

---

## Data model (new)
`client_events` (conversion), `store_day_closes` (Close-Day snapshot), `store_goals`
(monthly targets), `admin_locations` (+ `is_master_admin`/`admin_can_access_location`),
`floor_days` + `floor_checkins` (the rotation queue). Migrations **0009, 0010, 0011 —
all applied to the live database.**

## What's live vs pending
- **In production** (`livesportswear.vercel.app`, PR #21 merged): portal calendar,
  AM/PM board + red day-off, goals + dashboard metrics, per-location admins, Resend
  auth, nav cleanup, conversion stats + Close day.
- **Pending merge (PR #22)**: the **shop-floor rotation queue** + its server-side
  authorization hardening. On the preview now; one explicit merge from production.

## Provisioned
- **Master admin**: `ekinoxis.evm@gmail.com` (all stores).
- **Lincoln Road admin**: `live.lincolnrd@gmail.com` (scoped). Needs to set a password
  via `/forgot-password` once Resend is live.

## To finish go-live (your side)
1. Merge **PR #22** → ships the floor queue to production.
2. Vercel **Production** env: `RESEND_API_KEY` + **`RESEND_DRY_RUN=false`** (else
   invites/resets/reports don't send). Shopify POS + Meta keys when ready
   (`docs/ready-for-keys.md`).
3. Add **International Mall** under Admin → Locations; scope an admin to it.
