import { describe, expect, it } from "vitest";
import { remainingWorkdays } from "@/lib/scheduling/workdays";
import type { StatShift } from "@/lib/scheduling/stats";

const shift = (date: string, employee_id = "e1"): StatShift => ({
  employee_id,
  date,
  start_time: "09:00",
  end_time: "17:00",
  shift_template_id: null,
});

// March 2026: 31 days. Use maxDaysPerWeek = 5 (→ 5/7 ratio).
describe("remainingWorkdays", () => {
  it("counts distinct scheduled shift-dates when fully published to month-end", () => {
    const shifts = ["2026-03-23", "2026-03-25", "2026-03-27", "2026-03-31"].map((d) =>
      shift(d),
    );
    // today 2026-03-23, monthEnd 2026-03-31, last published = 31 → no tail.
    expect(remainingWorkdays(shifts, "e1", "2026-03-23", "2026-03-31", 5)).toBe(4);
  });

  it("collapses two shifts on the same day to one work-day", () => {
    const shifts = [shift("2026-03-23"), shift("2026-03-23")];
    // last published 03-23; tail 03-24..03-31 = 8 days × 5/7 ≈ 6 (round(5.71)).
    expect(remainingWorkdays(shifts, "e1", "2026-03-23", "2026-03-31", 5)).toBe(1 + 6);
  });

  it("uses the pure 5/7 estimate when nothing is scheduled", () => {
    // 9 calendar days (23..31) × 5/7 = 6.43 → 6.
    expect(remainingWorkdays([], "e1", "2026-03-23", "2026-03-31", 5)).toBe(6);
  });

  it("blends actual (published range) with the estimated tail", () => {
    // Scheduled 03-23 & 03-24 (last published 03-24); tail 03-25..03-31 = 7 × 5/7 = 5.
    const shifts = [shift("2026-03-23"), shift("2026-03-24")];
    expect(remainingWorkdays(shifts, "e1", "2026-03-23", "2026-03-31", 5)).toBe(2 + 5);
  });

  it("ignores other employees' shifts and out-of-range dates", () => {
    const shifts = [
      shift("2026-03-25", "e2"), // other employee
      shift("2026-03-01"), // before today
      shift("2026-04-02"), // after monthEnd
    ];
    // none in range for e1 → pure estimate for 23..31.
    expect(remainingWorkdays(shifts, "e1", "2026-03-23", "2026-03-31", 5)).toBe(6);
  });

  it("never exceeds the calendar days left", () => {
    // maxDaysPerWeek 7 → ratio 1; estimate would equal calendar days anyway.
    expect(remainingWorkdays([], "e1", "2026-03-30", "2026-03-31", 7)).toBe(2);
  });

  it("returns 0 when the month is already over", () => {
    expect(remainingWorkdays([], "e1", "2026-04-01", "2026-03-31", 5)).toBe(0);
  });

  it("handles a zero max_days_per_week (no workable days estimated)", () => {
    expect(remainingWorkdays([], "e1", "2026-03-23", "2026-03-31", 0)).toBe(0);
  });

  it("counts a single remaining scheduled day at month-end", () => {
    expect(remainingWorkdays([shift("2026-03-31")], "e1", "2026-03-31", "2026-03-31", 5)).toBe(1);
  });
});
