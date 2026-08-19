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
  send (`components/shared/report-wizard.tsx` — one wizard for both the test and
  close-of-day, so a rep learns one flow) and Re-take client
  (`retake-dialog.tsx`). Steps stay large enough to tap at arm's length.
  The report wizard's steps are **Recipients → Numbers → Note → Sending** (the
  last only on the kiosk, which has closers to pick). The **Note** step is
  optional free text that lands at the top of the report email; it carries a
  **Paste** button (`navigator.clipboard.readText()`) because the note is
  usually drafted somewhere else first, and falls back to a toast when Safari
  refuses the clipboard read rather than looking broken.
- **Floor buttons that mean opposite things get different colours.** Return /
  Exchange is amber, Re-take client is violet: one starts a new interaction, the
  other folds into an existing one, and at floor speed the words are easy to
  confuse.
- **The kiosk finish flow** (`components/store/finish-dialog.tsx`) is a branching
  step machine, not a `Wizard` — each step owns its own action. Two rules hold it
  together: **one question per screen, and the tap IS the answer** (no Continue to
  confirm — the rep is standing next to a client who is leaving), and **a `Back`
  at the bottom of every step but the first**. Those two go together: tap-to-advance
  is only safe because a mis-tap is one tap to undo. Back is a **history stack**
  (`useState<Step[]>`, push to go / pop to return), not a per-step back target —
  the flow branches (sold → order/contact/thank-you, no sale → bought/knew/reasons)
  and hand-wired targets would drift. Back is disabled while `pending` so it can't
  race a submit in flight. **Don't ask a question the previous answer already
  settles**: "bought before → yes" implies "knew the brand → yes", so that screen
  is skipped and the answer stored by implication (`src/lib/walkin-profile.ts`).
  Inference only ever runs in the direction that is a certainty — not having
  bought says nothing about whether they knew us, which is why the second
  question exists at all.
- **A rep with several clients open picks WHICH one finished.** Each open client
  carries its own id and its own live `ClientTimer` on the board
  (`sales-board.tsx`); the finish sends `client_id` so the duration and the
  outcome land on the client who actually left. With one open client the UI is
  unchanged — no extra tap for the common case.
- **A recurring chore interrupts; it doesn't wait to be noticed.** `ReminderPopup`
  (`components/store/reminder-popup.tsx`, rendered from `app/store/layout.tsx` so
  it covers every kiosk tab) is a Dialog held `open` with `onOpenChange` ignored
  — outside tap, Escape and swipe all do nothing, which is the point. Only **Done**
  clears it (writes the ack) and **Remind me in 10 minutes** hides it. The snooze
  is client state that writes nothing and dies on reload: a chore you can
  permanently dismiss without doing isn't a reminder. It rides the existing 45s
  `AutoRefresh` rather than polling. One popup at a time — two stacked on a floor
  screen is a wall.
- **A disabled action must name the cause that is actually blocking it.** The
  kiosk close-day buttons showed one catch-all line — "Needs someone on shift &
  checked in" — for three different causes. When a week sat unpublished in
  August 2026 the floor read that, re-checked everyone in (the one thing that
  was already fine), and **five days of reports were lost** before anyone
  diagnosed it. `ReportActions` now takes a `BlockedReason`
  (`unpublished` | `nobody-in` | `nobody-scheduled`) and says which. If a
  message can be wrong in a way that sends someone to fix the wrong thing, it is
  worse than no message.
- **The kiosk shell is `max-w-6xl` (1152px) — check it at BOTH 768 and 1024px.**
  It was `max-w-3xl` (768px) until 2026-08-17, which meant anything gated at
  `lg:` (1024px) could never render: two `lg:`-only columns shipped in 0061 and
  were invisible on the floor for a fortnight. The store iPad is used in
  **landscape** (~1080–1194 CSS px), so that whole column of width was being
  thrown away. Now `lg:` is genuinely reachable — which also means a `lg:` rule
  is live code, not decoration, and has to be looked at. The pattern that works:
  stack the detail **under** the cell it explains below `lg:`, and promote it to
  a real column above it (see `attendance-today.tsx`, which does both).
- **The `/store` board is two columns past `lg:`** — left is what you act on
  (up next, reps with clients), right is what you refer to (the floor at a
  glance, the line, returns). Below `lg:` it collapses to the original single
  stack, so portrait iPads and phones are unchanged.
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
- **Goal progress**: `GoalMeter` (`src/components/shared/goal-meter.tsx`) is the
  ONE shared monthly-goal visual — a single bar `0 → top level`: the fill turns
  **emerald** once the goal is reached, a tick marks each commission level (+ the
  set goal). **Everything is always on** (no tap/hover — so it's a plain
  server-renderable component, not `"use client"`): the current figure + %, then a
  **"$X more · $Y/day → next level (rate)"** line, then the tiers as tidy rows
  (reached ✓ green, the next highlighted with →, each with its target + rate). A
  `compact` prop gives a slim bar + one-line to-go summary for dense admin rows.
  The render model is pure in `src/lib/goal-meter.ts` (`buildGoalMeter`), reusing
  `goalPace` (day/workday basis), `storeGoalLevels` (store levels) and the
  commission tiers (per-rep). It replaced the old stacked `GoalIndicator`
  fill-card + `GoalLevelsBar` + `TierLadder` (all deleted). Used on kiosk
  Performance (store levels), portal (per-rep tiers) and admin Performance→Sales
  (compact).
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
sort only suits fully-loaded tables.**

For **server-paginated** tables (inventory book, admin/portal clients), sort
must run in the DB — client sort would only reorder the current page. Use
`ServerSortHead` (shadcn `<Table>`) or `ServerSortTh` (hand-rolled `<table>`)
from `src/components/shared/server-sort-head.tsx`: the header is a `<Link>` that
toggles `?sort=&dir=`, the page whitelists the sort key → `.order()`. The client
lists sort by cached Shopify stats on `customer_origin` (see data-model.md,
0051) since those columns can't be sorted while hydrated per-page.

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
- **Exception — grids that aren't lists.** `schedule-grid.tsx`,
  `schedule-board.tsx`, `store/schedule/page.tsx` and `w/[token]/[week]` use
  `<table>` for week layout, not data. They keep their own sticky column; pinning
  would fight the drag-and-drop. The same exemption covers the **matrices and
  input grids**: `shift-count-grid.tsx` (employees × AM/PM),
  `receive-screen.tsx` (reference × size) and `receiving-count.tsx` (per-size qty
  inputs). Sorting a matrix by a column is meaningless. **Every other data table
  in the app is sortable** — audited 2026-08-19; if you add one, it sorts.

## One column per variable
A data table shows one variable per column. Don't fold two fields into a cell,
and don't hide a field in a badge under another one — a reader scanning a column
should see every value of that variable in a line.

The width that buys is scarce, so **order columns by how often they are read,
not by how the data is shaped**, and drop the least-read ones first
(`hidden sm:table-cell`, then `xl:table-cell`). The attendance table is the
worked example: `Salesperson · Time · Result · Bought before · Knew LIVE! ·
Reason · Note · Duration · Customer · Order`, where Time drops below `sm` and
Customer below `xl` (it is filled on ~7% of rows). Position is what decides
whether a column is seen at all — two answers once sat 6th and 7th of eight in a
sideways-scrolling table and were invisible on the floor for a fortnight.

A **rare, long, free-text field earns a cell, not a wide column**: the note is
filled on ~5% of rows and averages 27 characters, so it renders `line-clamp-1`
and expands in place on tap. Not a tooltip — nobody finds a tooltip on a
touchscreen.

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
