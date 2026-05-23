# UI Patterns

## Brand
- Dark by default (`<html class="dark">`).
- Sporty + clean. Sans-serif (Geist).
- Single bright accent — current placeholder is zinc; finalize once we lift the exact accent from liveactivewear.com. To change, update the `--primary` variables in `globals.css`.

## When to use what
- **Dialog**: focused, modal interactions — confirming a publish, editing a shift template.
- **Sheet (right side)**: side-panel forms — adding an employee, editing a shift on the grid.
- **Drawer (bottom on mobile)**: avoid in v1; sheet is enough.
- **Sonner toast**: success / error confirmations after server actions.
- **Inline `<Alert>`**: persistent state messages on a page (e.g. "This schedule has 3 warnings").

## Layout
- Single fixed-width container `max-w-7xl mx-auto` for admin pages.
- The schedule grid is full-width, scrolls horizontally on narrow screens.
- Sidebar nav (left) on desktop, top tab nav on mobile (Phase 7).

## Density
- Comfortable but not airy. Cards use `p-4` to `p-6`. Tables use `py-2`.
- Numbers (hours, counts) always tabular-nums.

## Color usage
- `primary` for primary CTAs only.
- `destructive` only for destructive actions (delete, force-unpublish).
- `muted-foreground` for secondary metadata.
- Shifts on the calendar: colored by `shift_template.color`. Employee avatars colored by `employee.avatar_color`.

## Accessibility
- Every form input has a visible `<Label>`. No placeholders-as-labels.
- Color is never the only signal. Violations have both a color and an icon.
- Keyboard: every dialog and sheet traps focus; ESC closes; Cmd/Ctrl-K opens the global command palette (Phase 6).

## Email templates
- Plain, semantic table layout (`@react-email/components`).
- Live logo top, single accent color matching the app, dark mode supported via inline styles.
- Subject lines: action-first ("Your schedule for May 26 – Jun 1 is published"). No emojis.
