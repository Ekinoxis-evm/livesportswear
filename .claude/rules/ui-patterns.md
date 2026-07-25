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
- **Kiosk multi-step actions** use the same `Wizard` shell as admin: the report
  send (`components/store/report-wizard.tsx` — one wizard for both the test and
  close-of-day, so a rep learns one flow) and Re-take client
  (`retake-dialog.tsx`). Steps stay large enough to tap at arm's length.
- **Floor buttons that mean opposite things get different colours.** Return /
  Exchange is amber, Re-take client is violet: one starts a new interaction, the
  other folds into an existing one, and at floor speed the words are easy to
  confuse.
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
  has no ranking to show. `DayBars` (`components/portal/day-bars.tsx`) is a
  CSS-only per-day chart, no recharts, used for periods up to ~62 days.
- **Goal progress**: `GoalIndicator` (`src/components/shared/goal-indicator.tsx`)
  is the shared monthly-goal visual — a **fill-card** where the goal colour fills
  the card left→right to the percent, with the "left to reach" + per-day-pace
  figures on top (reached turns emerald). Used on portal · kiosk · admin; math is
  pure in `src/lib/goal-pace.ts` (`goalPace`). It replaced the old `GoalBar`.
- **A shift on a schedule**: `ShiftChip` (`src/components/schedule/shift-chip.tsx`)
  — name + time on a **light tint of the employee's profile colour**, not a dot.
  The tint helper is `shiftTint` in `src/lib/shift-color.ts` (a `color-mix`, works
  on light + dark cards); the admin grid keeps a stronger left stripe over it.
  Colour is never the only signal (name/time carry the shift). Reuse both — the
  `SLOT_COLOR` map + a local `Chip` used to be copy-pasted across four surfaces.
- **Inline `<Alert>`**: persistent state messages on a page (e.g. "This schedule has 3 warnings").
- **Daily-report recipients**: the recipient chips + add-field + "Send test report"
  editor is the shared `RecipientsManager` (`src/components/shared/recipients-manager.tsx`),
  which takes `add`/`remove`/`sendTest` action callbacks so each surface binds its own
  server action. Admin wraps it (`components/admin/report-recipients-card.tsx`,
  location-scoped by `requireAdmin`); the kiosk wraps it
  (`components/store/report-recipients-card.tsx`, store JWT's location). Reuse it — don't
  re-implement recipient editing. It keeps optimistic local state (chips update instantly).

## Data tables — the shell
Every data table is a live viewport, not a printout. Two shells, same behaviour:
- **`ScrollTable`** (`src/components/shared/scroll-table.tsx`) wraps hand-rolled
  `<table>` markup.
- **`Table`** (`src/components/ui/table.tsx`) already renders its own container,
  so the shadcn call sites get the same treatment for free.

**Click-to-sort (added 2026-07-25).** Sorting is a shared, opt-in capability —
don't hand-roll per-table sort. `useTableSort(rows, accessors, initial?)`
(`src/lib/use-table-sort.ts`) returns sorted rows + `{sort, onSort}`; the pure
`sortRows` comparator (stable, empties-last) is unit-tested. For the header,
hand-rolled tables use `<SortableTh sortKey sort onSort>`
(`src/components/shared/sortable-header.tsx`); shadcn tables pass
`sortKey`/`sort`/`onSort` to `<TableHead>`. Give each column a **comparable**
accessor (the raw number/string, not the formatted `"$118.40"`). A server-page
table becomes a small `"use client"` wrapper fed serializable rows. **Client
sort only suits fully-loaded tables** — server-paginated lists (admin/portal
clients, inventory book) need server-side sort (a `?sort=` param in the query),
or client sort would silently reorder just the current page.

Both give: **both-axis scroll** capped by `maxHeight` (long lists scroll in place
instead of pushing the page), a **sticky `<thead>`**, a **pinned first column**
with a hairline right edge (so columns sliding under it read as scrolled, not
clipped), **hover gated behind `@media (hover: hover)`** plus `active:` for touch
— without the gate, a tapped row keeps its hover state stuck on iPad — and the
`.scroll-table` **right-edge scrolling shadow** in `globals.css`, which appears
only while there's more to scroll to. That last one is what stops a wide table
reading as truncated.

- `density="comfortable"` (py-3, bigger touch targets) on the **kiosk**; admin
  and portal keep the compact default.
- All rules are descendant selectors, so call sites keep their own markup and
  their `hidden sm:table-cell` column rules.
- **Exception — the calendar grids.** `schedule-grid.tsx`, `schedule-board.tsx`,
  `store/schedule/page.tsx` and `w/[token]/[week]` use `<table>` for week layout,
  not data. They keep their own sticky column; pinning would fight the
  drag-and-drop. Don't convert them.

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

## Money
- `formatMoney` (`lib/commission.ts`) is **exact to the cent everywhere**. It
  used to round to whole dollars, which put every figure up to 50c out against
  Shopify and made totals look like they disagreed with the register. Chart axis
  ticks are the deliberate exception — they format compactly ("$12K") through
  their own formatter in `dashboard/sales-charts.tsx`.

## Email templates
- Plain, semantic table layout (`@react-email/components`).
- Live logo top; all templates share the app's **sepia light palette** (beige `#c8b8a9` page · white card · ink `#1d1d1d` text · deep-sepia `#4a3a32` accent/CTA with cream label · `#ded2c4` inner strips). Single light theme (no dark-mode variant). The daily report also emits a 4-sheet `.xlsx` attachment (`day-report-xlsx.ts`).
- Subject lines: action-first ("Your schedule for May 26 – Jun 1 is published"). No emojis.
