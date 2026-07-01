/**
 * Canonical AM/PM shifts. Hours are fixed app-wide (a location may also have
 * matching shift_templates for colour/headcount, but the board works without
 * them). Adding a shift to a slot uses the slot's template if one matches,
 * otherwise the slot's fixed times directly.
 */

export type ShiftSlot = { key: string; label: string; start: string; end: string };

export const SHIFT_SLOTS: ShiftSlot[] = [
  { key: "morning", label: "Morning", start: "09:30", end: "17:30" },
  { key: "evening", label: "Evening", start: "14:30", end: "22:30" },
];

type Tpl = { id: string; name: string; start_time: string; end_time: string };

const hhmm = (t: string) => t.slice(0, 5);

/** The location template backing a slot, matched by name or by identical hours. */
export function templateForSlot<T extends Tpl>(
  slot: ShiftSlot,
  templates: T[],
): T | undefined {
  return templates.find(
    (t) =>
      t.name.toLowerCase().includes(slot.key) ||
      (hhmm(t.start_time) === slot.start && hhmm(t.end_time) === slot.end),
  );
}

/** True if an existing shift belongs to this slot (by template or by hours). */
export function shiftMatchesSlot(
  shift: { shift_template_id: string | null; start_time: string; end_time: string },
  slot: ShiftSlot,
  tpl?: Tpl,
): boolean {
  if (tpl && shift.shift_template_id === tpl.id) return true;
  return (
    !shift.shift_template_id &&
    hhmm(shift.start_time) === slot.start &&
    hhmm(shift.end_time) === slot.end
  );
}

/** Canonical AM/PM label for a shift by its exact hours, or null if it matches none. */
export function slotLabelForHours(startTime: string, endTime: string): string | null {
  const slot = SHIFT_SLOTS.find(
    (s) => hhmm(startTime) === s.start && hhmm(endTime) === s.end,
  );
  return slot?.label ?? null;
}

/** createShift payload for adding to a slot — template id if backed, else times. */
export function slotCreatePayload(
  slot: ShiftSlot,
  templates: Tpl[],
): { shift_template_id: string } | { start_time: string; end_time: string } {
  const t = templateForSlot(slot, templates);
  return t ? { shift_template_id: t.id } : { start_time: slot.start, end_time: slot.end };
}
