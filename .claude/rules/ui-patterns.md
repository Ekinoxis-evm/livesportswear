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
- **Inline `<Alert>`**: persistent state messages on a page (e.g. "This schedule has 3 warnings").

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
- Live logo top, single accent color matching the app, dark mode supported via inline styles.
- Subject lines: action-first ("Your schedule for May 26 – Jun 1 is published"). No emojis.
