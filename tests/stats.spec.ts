import { describe, it, expect } from "vitest";
import {
  sumHours,
  hoursByEmployee,
  employeeStats,
  coverageSummary,
  type StatShift,
} from "@/lib/scheduling/stats";

function shift(over: Partial<StatShift> = {}): StatShift {
  return {
    employee_id: "e1",
    date: "2025-05-26",
    start_time: "09:00",
    end_time: "17:00", // 8h
    shift_template_id: "t1",
    ...over,
  };
}

describe("sumHours", () => {
  it("sums shift durations in hours", () => {
    expect(sumHours([shift(), shift({ end_time: "13:00" })])).toBe(12); // 8 + 4
  });
});

describe("hoursByEmployee", () => {
  it("accumulates hours per employee", () => {
    const out = hoursByEmployee([
      shift({ employee_id: "e1" }),
      shift({ employee_id: "e2", end_time: "12:00" }),
      shift({ employee_id: "e1", date: "2025-05-27" }),
    ]);
    expect(out).toEqual({ e1: 16, e2: 3 });
  });
});

describe("employeeStats", () => {
  it("reports totals for the employee's shifts", () => {
    const out = employeeStats(
      [
        shift({ date: "2025-05-26" }),
        shift({ date: "2025-05-27", end_time: "13:00" }),
        shift({ employee_id: "other" }),
      ],
      "e1",
    );
    expect(out).toEqual({
      totalHours: 12,
      shiftCount: 2,
      daysWorked: 2,
      avgShiftHours: 6,
    });
  });
  it("returns zeros when the employee has no shifts", () => {
    expect(employeeStats([], "e1")).toEqual({
      totalHours: 0,
      shiftCount: 0,
      daysWorked: 0,
      avgShiftHours: 0,
    });
  });
});

describe("coverageSummary", () => {
  it("computes filled vs required and open shifts", () => {
    const out = coverageSummary({
      shifts: [shift({ date: "2025-05-26", shift_template_id: "t1" })],
      templates: [{ id: "t1", default_headcount: 1 }],
      days: ["2025-05-26", "2025-05-27"],
    });
    expect(out.rows[0]).toEqual({
      templateId: "t1",
      staffed: 1,
      required: 2,
      rate: 0.5,
    });
    expect(out.openShifts).toBe(1);
    expect(out.totalHours).toBe(8);
  });
  it("treats a zero-headcount template as fully covered", () => {
    const out = coverageSummary({
      shifts: [],
      templates: [{ id: "t1", default_headcount: 0 }],
      days: ["2025-05-26"],
    });
    expect(out.rows[0].rate).toBe(1);
    expect(out.openShifts).toBe(0);
  });
});
