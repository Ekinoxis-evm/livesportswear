# UI Patterns

## Brand
- **Light by default** (brand cream `#F4F0F0` background, white cards), with a
  user dark-mode toggle (`next-themes`, class strategy; `ThemeToggle` in the
  admin sidebar footer, admin mobile header, and portal header).
- Sporty + clean. Sans-serif (Inter); Fraunces for display headings.
- Accent (finalized 2026-07): **forest green** — `--primary: #1f5240` light /
  `#5ca987` dark, tied to the brand's reforestation identity. Change via the
  `--primary` variables in `globals.css`.
- The **admin sidebar is deep forest green (`--sidebar: #16352a`) in both
  themes** — a constant brand element; active nav item is a cream pill
  (`sidebar-accent`). Palette hexes trace to `public/branding.md`.

## When to use what
- **Wizard (`src/components/shared/wizard.tsx`)**: any multi-step create/edit
  flow — the canonical pattern for complex forms (contest wizard in a centered
  Dialog, employee wizard as a full page). Progress pills, per-step validation,
  back-clickable steps.
- **Dialog**: focused, modal interactions — confirming a publish or delete.
- **Sheet (right side)**: simple side-panel edits — editing a shift on the grid.
- **Drawer (bottom on mobile)**: avoid; sheet/wizard is enough.
- **Sonner toast**: success / error confirmations after server actions.
- **Ranked employee sales**: ALWAYS the sales-period module — `PeriodPills`
  (Today · Week · Month · Custom; Custom is a pill that reveals
  `DateRangeForm`) + `SalesRankTable` (`# · Employee (· Store) · Value ·
  Discounts · Returns · Net` + optional Goal/Share/commission columns),
  driven by `resolveSalesPeriod`/`periodBounds`/`staffRowsFromEntries`/
  `monthRows` in `src/lib/sales-period.ts`. Used on kiosk Performance,
  admin Dashboard (commission columns in Month view only), admin
  Performance→Sales, and the public week page (Week · Today only). Don't
  hand-roll new period pills or sales tables.
- **Personal (single-rep) metrics**: the portal Performance hub
  (`src/app/portal/(performance)/`) uses `PeriodPills` with the same
  `resolveSalesPeriod`/`periodBounds` pair, but renders a `Stat`/`StatGrid` grid
  (`src/components/portal/stats.tsx`) instead of `SalesRankTable` — one person
  has no ranking to show. `GoalBar` is the shared goal-progress bar; `DayBars`
  (`components/portal/day-bars.tsx`) is a CSS-only per-day chart, no recharts,
  used for periods up to ~62 days.
- **Inline `<Alert>`**: persistent state messages on a page (e.g. "This schedule has 3 warnings").
- **Daily-report recipients**: the recipient chips + add-field + "Send test report"
  editor is the shared `RecipientsManager` (`src/components/shared/recipients-manager.tsx`),
  which takes `add`/`remove`/`sendTest` action callbacks so each surface binds its own
  server action. Admin wraps it (`components/admin/report-recipients-card.tsx`,
  location-scoped by `requireAdmin`); the kiosk wraps it
  (`components/store/report-recipients-card.tsx`, store JWT's location). Reuse it — don't
  re-implement recipient editing. It keeps optimistic local state (chips update instantly).

## Responsive tables
- Two idioms, no card-stack: **(a)** wrap the table in `overflow-x-auto` (it scrolls
  horizontally on narrow screens — shadcn `<Table>` already self-wraps); **(b)** drop
  low-priority columns on mobile with `hidden sm:table-cell` on both the `<th>` and `<td>`.
  Keep the identifying column + the 1–2 key numbers always visible. The kiosk
  (`max-w-3xl`, iPad portrait) uses (b): e.g. per-seller table keeps `Salesperson · Orders ·
  Avg ticket`, hides `Net`; the orders/attendance lists hide time/seller/customer. Examples:
  `src/components/store/{orders-today,attendance-today}.tsx`, `admin/inventory/book/page.tsx`.

## Layout
- Single fixed-width container `max-w-7xl mx-auto` for admin pages.
- The schedule grid is full-width, scrolls horizontally on narrow screens.
- Sidebar nav (left) on desktop; fixed BOTTOM bar on mobile (`admin-mobile-nav.tsx`, driven by the `primary` flag in `NAV_ITEMS`; the "More" sheet uses `flatNav()`). The sidebar groups team routes under an **Employees** section (Profiles · Schedule · Performance · Rewards · Commission) — grouping only, no route moves. Performance is a route-tab hub (`performance-tabs.tsx`).

## Density
- Comfortable but not airy. Cards use `p-4` to `p-6`. Tables use `py-2`.
- Numbers (hours, counts) always tabular-nums.

## Color usage
- `primary` for primary CTAs only.
- `destructive` only for destructive actions (delete, force-unpublish).
- `muted-foreground` for secondary metadata.
- Shifts on the calendar: colored by `shift_template.color`. Employee colors
  come from the fixed palette in `src/lib/avatar-palette.ts`, chosen via the
  `ColorSwatches` picker (never a free-text hex); every employee has one
  (0038 backfill + server-side default at create). Avatars everywhere use
  `EmployeeAvatar` (`components/shared/employee-avatar.tsx`): the uploaded
  profile photo (`employees.avatar_url`, public bucket) when set, else
  initials on the employee color.

## Accessibility
- Every form input has a visible `<Label>`. No placeholders-as-labels.
- Color is never the only signal. Violations have both a color and an icon.
- Keyboard: every dialog and sheet traps focus; ESC closes.

## Email templates
- Plain, semantic table layout (`@react-email/components`).
- Live logo top; all templates share the app's **sepia light palette** (beige `#c8b8a9` page · white card · ink `#1d1d1d` text · deep-sepia `#4a3a32` accent/CTA with cream label · `#ded2c4` inner strips). Single light theme (no dark-mode variant). The daily report also emits a 4-sheet `.xlsx` attachment (`day-report-xlsx.ts`).
- Subject lines: action-first ("Your schedule for May 26 – Jun 1 is published"). No emojis.
