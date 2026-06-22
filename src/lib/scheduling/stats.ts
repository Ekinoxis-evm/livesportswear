/**
 * Pure stats over shifts. No DB. Hours use location-local times as stored
 * (a 09:30→17:30 shift is 8h regardless of DST). See scheduling-skill.
 */
import { shiftDurationMinutes } from "@/lib/scheduling/conflicts";

export type StatShift = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_template_id: string | null;
};

export function sumHours(
  shifts: { start_time: string; end_time: string }[],
): number {
  const minutes = shifts.reduce(
    (acc, s) => acc + shiftDurationMinutes(s.start_time, s.end_time),
    0,
  );
  return minutes / 60;
}

export function hoursByEmployee(shifts: StatShift[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of shifts) {
    out[s.employee_id] =
      (out[s.employee_id] ?? 0) +
      shiftDurationMinutes(s.start_time, s.end_time) / 60;
  }
  return out;
}

export type EmployeeStats = {
  totalHours: number;
  shiftCount: number;
  daysWorked: number;
  avgShiftHours: number;
};

export function employeeStats(
  shifts: StatShift[],
  employeeId: string,
): EmployeeStats {
  const mine = shifts.filter((s) => s.employee_id === employeeId);
  const totalHours = sumHours(mine);
  const shiftCount = mine.length;
  const daysWorked = new Set(mine.map((s) => s.date)).size;
  const avgShiftHours = shiftCount === 0 ? 0 : totalHours / shiftCount;
  return { totalHours, shiftCount, daysWorked, avgShiftHours };
}

export type CoverageRow = {
  templateId: string;
  staffed: number;
  required: number;
  rate: number;
};

/**
 * Coverage per template across `days`: filled vs required slots (capped at
 * headcount so rate ≤ 1) plus the count of unfilled slots.
 */
export function coverageSummary(input: {
  shifts: StatShift[];
  templates: { id: string; default_headcount: number }[];
  days: string[];
}): { rows: CoverageRow[]; openShifts: number; totalHours: number } {
  const rows: CoverageRow[] = [];
  let openShifts = 0;

  for (const tpl of input.templates) {
    let staffed = 0;
    let required = 0;
    for (const date of input.days) {
      const have = new Set(
        input.shifts
          .filter((s) => s.shift_template_id === tpl.id && s.date === date)
          .map((s) => s.employee_id),
      ).size;
      staffed += Math.min(have, tpl.default_headcount);
      required += tpl.default_headcount;
      openShifts += Math.max(0, tpl.default_headcount - have);
    }
    const rate = required === 0 ? 1 : staffed / required;
    rows.push({ templateId: tpl.id, staffed, required, rate });
  }

  return { rows, openShifts, totalHours: sumHours(input.shifts) };
}
