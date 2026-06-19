import { describe, it, expect } from "vitest";
import { validateSchedule, hasBlockers } from "@/lib/scheduling/rules";
import type {
  RuleEmployee,
  RuleShift,
  ValidateScheduleInput,
} from "@/types/domain";

const WEEK = "2025-05-26"; // a Monday

function emp(over: Partial<RuleEmployee> = {}): RuleEmployee {
  return {
    id: "e1",
    name: "Mara",
    weekly_hour_target: 40,
    max_days_per_week: 5,
    weekly_days_off: 2,
    preferred_days_off: [],
    ...over,
  };
}

function shift(over: Partial<RuleShift> = {}): RuleShift {
  return {
    employee_id: "e1",
    date: WEEK,
    start_time: "09:00",
    end_time: "17:00",
    shift_template_id: null,
    ...over,
  };
}

function input(over: Partial<ValidateScheduleInput> = {}): ValidateScheduleInput {
  return {
    schedule: { week_start: WEEK },
    shifts: [],
    employees: [],
    timeOff: [],
    templates: [],
    ...over,
  };
}

const codes = (input: ValidateScheduleInput) =>
  validateSchedule(input).map((v) => v.code);

describe("validateSchedule", () => {
  it("returns no violations for an empty schedule", () => {
    expect(validateSchedule(input())).toEqual([]);
  });

  it("ignores shifts outside the schedule week", () => {
    const out = validateSchedule(
      input({ employees: [emp()], shifts: [shift({ date: "2025-06-02" })] }),
    );
    expect(out).toEqual([]);
  });

  it("blocks overlapping shifts on the same day", () => {
    const out = input({
      employees: [emp()],
      shifts: [
        shift({ start_time: "09:00", end_time: "13:00" }),
        shift({ start_time: "12:00", end_time: "17:00" }),
      ],
    });
    expect(codes(out)).toContain("OVERLAPPING_SHIFTS");
  });

  it("blocks a shift during approved time off, ignoring pending requests", () => {
    const out = input({
      employees: [emp()],
      shifts: [shift()],
      timeOff: [
        { employee_id: "e1", start_date: WEEK, end_date: WEEK, status: "approved" },
        {
          employee_id: "e1",
          start_date: "2025-05-27",
          end_date: "2025-05-27",
          status: "pending",
        },
      ],
    });
    expect(codes(out)).toContain("ON_TIME_OFF");
  });

  it("blocks when worked days exceed max_days_per_week", () => {
    const out = input({
      employees: [emp({ max_days_per_week: 2 })],
      shifts: [
        shift({ date: "2025-05-26" }),
        shift({ date: "2025-05-27" }),
        shift({ date: "2025-05-28" }),
      ],
    });
    expect(codes(out)).toContain("MAX_DAYS_EXCEEDED");
  });

  it("blocks when days off fall below weekly_days_off", () => {
    const out = input({
      employees: [emp({ max_days_per_week: 6, weekly_days_off: 2 })],
      shifts: [
        "2025-05-26",
        "2025-05-27",
        "2025-05-28",
        "2025-05-29",
        "2025-05-30",
        "2025-05-31",
      ].map((d) => shift({ date: d })),
    });
    expect(codes(out)).toContain("BELOW_MIN_DAYS_OFF");
  });

  it("warns when hours exceed the weekly target (incl. overnight shifts)", () => {
    const out = input({
      employees: [emp({ weekly_hour_target: 5, weekly_days_off: 0 })],
      shifts: [shift({ start_time: "22:00", end_time: "06:00" })],
    });
    expect(codes(out)).toContain("ABOVE_HOUR_TARGET");
  });

  it("warns once per day when a preferred day off is used", () => {
    const out = validateSchedule(
      input({
        employees: [emp({ preferred_days_off: ["monday"] })],
        shifts: [
          shift({ start_time: "09:00", end_time: "12:00" }),
          shift({ start_time: "13:00", end_time: "17:00" }),
        ],
      }),
    );
    expect(out.filter((v) => v.code === "PREFERRED_DAY_OFF_USED")).toHaveLength(
      1,
    );
  });

  it("warns about days below a template's coverage, but not staffed days", () => {
    const out = validateSchedule(
      input({
        employees: [emp()],
        templates: [{ id: "t1", name: "Morning", default_headcount: 1 }],
        shifts: [shift({ shift_template_id: "t1" })],
      }),
    );
    const coverage = out.filter((v) => v.code === "BELOW_COVERAGE");
    expect(coverage).toHaveLength(6); // Mon staffed, Tue–Sun short
    expect(coverage.map((v) => v.date)).not.toContain(WEEK);
  });
});

describe("hasBlockers", () => {
  it("is true when a blocking violation exists", () => {
    const out = validateSchedule(
      input({
        employees: [emp({ max_days_per_week: 0 })],
        shifts: [shift()],
      }),
    );
    expect(hasBlockers(out)).toBe(true);
  });
  it("is false for only warnings", () => {
    expect(hasBlockers([{ level: "warn", code: "BELOW_COVERAGE", message: "x" }])).toBe(
      false,
    );
  });
});
