import { describe, expect, it } from "vitest";
import {
  buildShiftGrid,
  isAfternoon,
  accumulatedShiftCounts,
  weekdayShiftGrid,
} from "@/lib/scheduling/shift-grid";
import type { StatShift } from "@/lib/scheduling/stats";

const shift = (o: Partial<StatShift> = {}): StatShift => ({
  employee_id: "e1",
  date: "2026-03-23",
  start_time: "09:00:00",
  end_time: "17:00:00",
  shift_template_id: null,
  ...o,
});

const days = ["2026-03-23", "2026-03-24", "2026-03-25"];
const employees = [
  { id: "e1", name: "Vale" },
  { id: "e2", name: "Patricia" },
];

describe("isAfternoon", () => {
  it("is AM before noon", () => {
    expect(isAfternoon("09:00")).toBe(false);
    expect(isAfternoon("11:59:59")).toBe(false);
  });
  it("is PM from noon on", () => {
    expect(isAfternoon("12:00")).toBe(true);
    expect(isAfternoon("20:30:00")).toBe(true);
  });
});

describe("buildShiftGrid", () => {
  it("counts a shift in exactly one half by its start time", () => {
    const g = buildShiftGrid(
      [shift({ start_time: "09:00" }), shift({ start_time: "14:00" })],
      employees,
      days,
    );
    const e1 = g.rows.find((r) => r.employeeId === "e1")!;
    expect(e1.cells[0]).toEqual({ am: 1, pm: 1 });
    expect(e1.total).toBe(2);
  });

  it("gives every employee a row, zeros included", () => {
    const g = buildShiftGrid([shift()], employees, days);
    const e2 = g.rows.find((r) => r.employeeId === "e2")!;
    expect(e2.total).toBe(0);
    expect(e2.cells).toEqual([
      { am: 0, pm: 0 },
      { am: 0, pm: 0 },
      { am: 0, pm: 0 },
    ]);
  });

  it("keeps every day as a column even with no shifts", () => {
    const g = buildShiftGrid([shift({ date: "2026-03-25" })], employees, days);
    expect(g.days).toHaveLength(3);
    const e1 = g.rows.find((r) => r.employeeId === "e1")!;
    expect(e1.cells[0]).toEqual({ am: 0, pm: 0 }); // Mon empty
    expect(e1.cells[2]).toEqual({ am: 1, pm: 0 }); // Wed has it
  });

  it("sums column totals across everyone", () => {
    const g = buildShiftGrid(
      [
        shift({ employee_id: "e1", start_time: "08:00" }),
        shift({ employee_id: "e2", start_time: "13:00" }),
      ],
      employees,
      days,
    );
    expect(g.dayTotals[0]).toEqual({ am: 1, pm: 1 });
  });

  it("ignores shifts outside the day window or for unknown employees", () => {
    const g = buildShiftGrid(
      [
        shift({ date: "2026-03-30" }), // outside window
        shift({ employee_id: "ghost" }), // unknown employee
      ],
      employees,
      days,
    );
    expect(g.rows.every((r) => r.total === 0)).toBe(true);
    expect(g.dayTotals.every((c) => c.am === 0 && c.pm === 0)).toBe(true);
  });

  it("orders rows by the employee list, not by shift data", () => {
    const g = buildShiftGrid([shift({ employee_id: "e2" })], employees, days);
    expect(g.rows.map((r) => r.name)).toEqual(["Vale", "Patricia"]);
  });
});

describe("accumulatedShiftCounts", () => {
  const emps = [
    { id: "e1", name: "Vale" },
    { id: "e2", name: "Patricia" },
  ];

  it("sums AM/PM/total across all shifts, any dates", () => {
    const out = accumulatedShiftCounts(
      [
        shift({ employee_id: "e1", start_time: "09:00", date: "2024-03-01" }),
        shift({ employee_id: "e1", start_time: "14:00", date: "2024-06-15" }),
        shift({ employee_id: "e1", start_time: "10:00", date: "2025-01-02" }),
      ],
      emps,
    );
    expect(out.find((r) => r.employeeId === "e1")).toMatchObject({ am: 2, pm: 1, total: 3 });
  });

  it("gives every employee a row, zeros included, sorted by total desc", () => {
    const out = accumulatedShiftCounts([shift({ employee_id: "e2" })], emps);
    expect(out[0].employeeId).toBe("e2"); // has 1
    expect(out[1]).toMatchObject({ employeeId: "e1", total: 0 });
  });

  it("ignores shifts for unknown employees", () => {
    const out = accumulatedShiftCounts([shift({ employee_id: "ghost" })], emps);
    expect(out.every((r) => r.total === 0)).toBe(true);
  });
});

describe("weekdayShiftGrid", () => {
  const emps = [
    { id: "e1", name: "Vale" },
    { id: "e2", name: "Patricia" },
  ];

  it("buckets shifts by weekday across all time, AM/PM split", () => {
    const g = weekdayShiftGrid(
      [
        // Two different Mondays, one AM one PM → Monday cell {am:1, pm:1}.
        shift({ employee_id: "e1", date: "2026-03-23", start_time: "09:00" }), // Mon
        shift({ employee_id: "e1", date: "2026-03-30", start_time: "15:00" }), // Mon
        shift({ employee_id: "e1", date: "2026-03-25", start_time: "10:00" }), // Wed
      ],
      emps,
    );
    const e1 = g.rows.find((r) => r.employeeId === "e1")!;
    expect(e1.cells[0]).toEqual({ am: 1, pm: 1 }); // Monday
    expect(e1.cells[2]).toEqual({ am: 1, pm: 0 }); // Wednesday
    expect(e1.total).toBe(3);
  });

  it("has seven weekday columns Monday…Sunday", () => {
    const g = weekdayShiftGrid([shift({ date: "2026-03-29" })], emps); // Sunday
    const e1 = g.rows.find((r) => r.employeeId === "e1")!;
    expect(e1.cells).toHaveLength(7);
    expect(e1.cells[6]).toEqual({ am: 1, pm: 0 }); // Sunday is the 7th column
  });

  it("sums weekday column totals across everyone, busiest row first", () => {
    const g = weekdayShiftGrid(
      [
        shift({ employee_id: "e2", date: "2026-03-24", start_time: "08:00" }), // Tue AM
        shift({ employee_id: "e1", date: "2026-03-24", start_time: "13:00" }), // Tue PM
        shift({ employee_id: "e2", date: "2026-03-24", start_time: "09:00" }), // Tue AM
      ],
      emps,
    );
    expect(g.dayTotals[1]).toEqual({ am: 2, pm: 1 }); // Tuesday
    expect(g.rows[0].employeeId).toBe("e2"); // 2 shifts, ahead of e1's 1
  });

  it("ignores unknown employees and dateless shifts", () => {
    const g = weekdayShiftGrid(
      [shift({ employee_id: "ghost" }), shift({ date: "" })],
      emps,
    );
    expect(g.rows.every((r) => r.total === 0)).toBe(true);
    expect(g.dayTotals.every((c) => c.am === 0 && c.pm === 0)).toBe(true);
  });
});
