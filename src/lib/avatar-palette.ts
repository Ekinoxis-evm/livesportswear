/**
 * The employee color palette — the only colors the picker offers. Chosen to
 * stay readable as small schedule dots AND behind white initials on the
 * kiosk. Legacy free-typed hexes remain valid; they just render as an extra
 * swatch when editing.
 */
export const AVATAR_COLORS = [
  "#1f5240", // forest (brand)
  "#0e7490", // cyan
  "#1d4ed8", // blue
  "#7c3aed", // violet
  "#be185d", // pink
  "#dc2626", // red
  "#ea580c", // orange
  "#ca8a04", // amber
  "#65a30d", // lime
  "#059669", // emerald
  "#0d9488", // teal
  "#6366f1", // indigo
  "#a855f7", // purple
  "#e11d48", // rose
  "#78716c", // stone
  "#334155", // slate
] as const;

export function pickAvatarColor(i: number): string {
  return AVATAR_COLORS[((i % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length];
}
