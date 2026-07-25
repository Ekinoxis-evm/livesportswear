/**
 * Rendering a shift by the employee's own colour. The colour reads as a LIGHT
 * tinted background (not a small dot), so at a glance the schedule shows who is
 * working by colour block. Kept as one helper so every surface — admin grid and
 * board, kiosk week, public week — tints identically.
 *
 * `color-mix` gives a translucent tint that sits correctly on a white card OR a
 * dark one, so no per-theme handling is needed.
 */

/** Fallback shift-type colours (was copy-pasted across four schedule files). */
export const SLOT_COLOR: Record<string, string> = {
  morning: "#22c55e",
  evening: "#a855f7",
};

/**
 * Inline-style values that turn a raw employee/shift hex (or a CSS colour like
 * `var(--color-primary)`) into a soft background + a readable border accent.
 */
export function shiftTint(color: string | null | undefined): {
  backgroundColor: string;
  borderColor: string;
} {
  const c = color ?? "var(--color-primary)";
  return {
    backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${c} 40%, transparent)`,
  };
}
