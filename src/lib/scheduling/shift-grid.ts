/**
 * The shift-count grid: employees down the rows, days across the columns, each
 * cell split AM | PM. A shift is AM when it starts before noon, PM otherwise —
 * one shift counts once, in exactly one half.
 *
 * Pure. No DB, no clock. Times are the location-local `HH:MM[:SS]` strings as
 * stored (see stats.ts on why local is correct).
 */
import type { StatShift } from "@/lib/scheduling/stats";

/** A shift starting at or after 12:00 is PM; anything earlier is AM. */
export function isAfternoon(startTime: string): boolean {
  const hour = Number(startTime.slice(0, 2));
  return hour >= 12;
}

export type ShiftCell = { am: number; pm: number };

export type ShiftGridRow = {
  employeeId: string;
  name: string;
  /** One cell per day, in the same order as `days`. */
  cells: ShiftCell[];
  total: number;
};

export type ShiftGrid = {
  days: string[];
  rows: ShiftGridRow[];
  /** Column totals, one per day (am/pm summed across everyone). */
  dayTotals: ShiftCell[];
};

/**
 * Build the grid over an explicit day list, so a week with no shifts on a day
 * still shows that day as a zero column. Every employee gets a row (a rep with
 * no shifts this week is a real, visible fact — they show all zeros), ordered
 * by the `employees` list. Shifts for days outside `days`, or employees not in
 * the list, are ignored.
 */
export function buildShiftGrid(
  shifts: StatShift[],
  employees: { id: string; name: string }[],
  days: string[],
): ShiftGrid {
  const dayIndex = new Map(days.map((d, i) => [d, i]));
  const byEmployee = new Map<string, ShiftCell[]>();
  for (const e of employees) {
    byEmployee.set(
      e.id,
      days.map(() => ({ am: 0, pm: 0 })),
    );
  }

  for (const s of shifts) {
    const cells = byEmployee.get(s.employee_id);
    const col = dayIndex.get(s.date);
    if (!cells || col === undefined) continue;
    if (isAfternoon(s.start_time)) cells[col].pm += 1;
    else cells[col].am += 1;
  }

  const dayTotals: ShiftCell[] = days.map(() => ({ am: 0, pm: 0 }));
  const rows: ShiftGridRow[] = employees.map((e) => {
    // Non-null: every employee id was seeded into byEmployee above.
    const cells = byEmployee.get(e.id)!;
    let total = 0;
    cells.forEach((cell, i) => {
      total += cell.am + cell.pm;
      dayTotals[i].am += cell.am;
      dayTotals[i].pm += cell.pm;
    });
    return { employeeId: e.id, name: e.name, cells, total };
  });

  return { days, rows, dayTotals };
}
