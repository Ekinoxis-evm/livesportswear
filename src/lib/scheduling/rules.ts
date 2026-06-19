import { weekDays, isoWeekday } from "@/lib/scheduling/week";
import { overlaps, shiftDurationMinutes } from "@/lib/scheduling/conflicts";
import { WEEKDAYS } from "@/lib/weekdays";
import type {
  Violation,
  ValidateScheduleInput,
  RuleShift,
} from "@/types/domain";

/**
 * The single source of truth for schedule validity. Pure — no DB calls.
 * Runs on every edit (debounced) and again server-side at publish time.
 * `block`-level violations must prevent publishing; `warn` are advisory.
 */
export function validateSchedule(input: ValidateScheduleInput): Violation[] {
  const violations: Violation[] = [];
  const days = weekDays(input.schedule.week_start);
  const daySet = new Set(days);

  // Only consider shifts that fall inside the schedule's week.
  const weekShifts = input.shifts.filter((s) => daySet.has(s.date));
  const approvedTimeOff = input.timeOff.filter((t) => t.status === "approved");

  for (const emp of input.employees) {
    const empShifts = weekShifts.filter((s) => s.employee_id === emp.id);

    // OVERLAPPING_SHIFTS — per day, any two shifts whose ranges intersect.
    const byDate = new Map<string, RuleShift[]>();
    for (const s of empShifts) {
      const list = byDate.get(s.date) ?? [];
      list.push(s);
      byDate.set(s.date, list);
    }
    for (const [date, list] of byDate) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (overlaps(list[i], list[j])) {
            violations.push({
              level: "block",
              code: "OVERLAPPING_SHIFTS",
              employeeId: emp.id,
              date,
              message: `${emp.name} has overlapping shifts on ${date}.`,
            });
          }
        }
      }
    }

    // ON_TIME_OFF — a shift inside an approved time-off range.
    for (const s of empShifts) {
      const off = approvedTimeOff.some(
        (t) =>
          t.employee_id === emp.id &&
          s.date >= t.start_date &&
          s.date <= t.end_date,
      );
      if (off) {
        violations.push({
          level: "block",
          code: "ON_TIME_OFF",
          employeeId: emp.id,
          date: s.date,
          message: `${emp.name} is scheduled during approved time off on ${s.date}.`,
        });
      }
    }

    // MAX_DAYS_EXCEEDED / BELOW_MIN_DAYS_OFF
    const workedDays = new Set(empShifts.map((s) => s.date));
    if (workedDays.size > emp.max_days_per_week) {
      violations.push({
        level: "block",
        code: "MAX_DAYS_EXCEEDED",
        employeeId: emp.id,
        message: `${emp.name} works ${workedDays.size} days (max ${emp.max_days_per_week}).`,
      });
    }
    const daysOff = 7 - workedDays.size;
    if (daysOff < emp.weekly_days_off) {
      violations.push({
        level: "block",
        code: "BELOW_MIN_DAYS_OFF",
        employeeId: emp.id,
        message: `${emp.name} has ${daysOff} days off (needs ${emp.weekly_days_off}).`,
      });
    }

    // ABOVE_HOUR_TARGET
    const totalMinutes = empShifts.reduce(
      (sum, s) => sum + shiftDurationMinutes(s.start_time, s.end_time),
      0,
    );
    const hours = totalMinutes / 60;
    if (hours > emp.weekly_hour_target) {
      violations.push({
        level: "warn",
        code: "ABOVE_HOUR_TARGET",
        employeeId: emp.id,
        message: `${emp.name} is scheduled ${hours.toFixed(1)}h (target ${emp.weekly_hour_target}h).`,
      });
    }

    // PREFERRED_DAY_OFF_USED — one warning per offending date.
    const flaggedDays = new Set<string>();
    for (const s of empShifts) {
      const weekday = WEEKDAYS[isoWeekday(s.date) - 1];
      if (emp.preferred_days_off.includes(weekday) && !flaggedDays.has(s.date)) {
        flaggedDays.add(s.date);
        violations.push({
          level: "warn",
          code: "PREFERRED_DAY_OFF_USED",
          employeeId: emp.id,
          date: s.date,
          message: `${emp.name} works ${weekday}, a preferred day off.`,
        });
      }
    }
  }

  // BELOW_COVERAGE — each weekday short of a template's default headcount.
  for (const tpl of input.templates) {
    for (const date of days) {
      const staffed = new Set(
        weekShifts
          .filter((s) => s.shift_template_id === tpl.id && s.date === date)
          .map((s) => s.employee_id),
      ).size;
      if (staffed < tpl.default_headcount) {
        violations.push({
          level: "warn",
          code: "BELOW_COVERAGE",
          date,
          templateId: tpl.id,
          message: `${tpl.name} on ${date} has ${staffed}/${tpl.default_headcount} staffed.`,
        });
      }
    }
  }

  return violations;
}

/** Convenience: are there any blocking violations? */
export function hasBlockers(violations: Violation[]): boolean {
  return violations.some((v) => v.level === "block");
}
