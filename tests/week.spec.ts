import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isValidDateStr,
  addDays,
  isoWeekday,
  isMonday,
  weekStart,
  weekDays,
  currentWeekStart,
  normalizeWeekStart,
  formatWeekRange,
} from "@/lib/scheduling/week";

describe("isValidDateStr", () => {
  it("accepts a real date", () => {
    expect(isValidDateStr("2025-05-26")).toBe(true);
  });
  it("rejects a malformed string", () => {
    expect(isValidDateStr("2025/05/26")).toBe(false);
  });
  it("rejects an impossible calendar date", () => {
    expect(isValidDateStr("2025-02-30")).toBe(false);
  });
});

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2025-05-30", 3)).toBe("2025-06-02");
  });
  it("goes backwards across a year boundary", () => {
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
  });
});

describe("isoWeekday", () => {
  it.each([
    ["2025-05-26", 1],
    ["2025-05-30", 5],
    ["2025-06-01", 7],
  ])("maps %s to ISO weekday %i", (date, expected) => {
    expect(isoWeekday(date)).toBe(expected);
  });
});

describe("isMonday", () => {
  it("is true on a Monday", () => {
    expect(isMonday("2025-05-26")).toBe(true);
  });
  it("is false on a Sunday", () => {
    expect(isMonday("2025-06-01")).toBe(false);
  });
});

describe("weekStart", () => {
  it("returns the same date when already a Monday", () => {
    expect(weekStart("2025-05-26")).toBe("2025-05-26");
  });
  it("returns the prior Monday for a mid-week date", () => {
    expect(weekStart("2025-05-29")).toBe("2025-05-26");
  });
  it("returns the prior Monday for a Sunday", () => {
    expect(weekStart("2025-06-01")).toBe("2025-05-26");
  });
});

describe("weekDays", () => {
  it("returns Mon→Sun for the containing week", () => {
    expect(weekDays("2025-05-29")).toEqual([
      "2025-05-26",
      "2025-05-27",
      "2025-05-28",
      "2025-05-29",
      "2025-05-30",
      "2025-05-31",
      "2025-06-01",
    ]);
  });
});

describe("currentWeekStart", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the system clock by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-05-29T09:00:00Z"));
    expect(currentWeekStart()).toBe("2025-05-26");
  });
  it("accepts an explicit now", () => {
    expect(currentWeekStart(new Date("2025-06-01T23:00:00Z"))).toBe(
      "2025-05-26",
    );
  });
});

describe("normalizeWeekStart", () => {
  it("snaps a valid param to its Monday", () => {
    expect(normalizeWeekStart("2025-05-29", "2025-01-06")).toBe("2025-05-26");
  });
  it("falls back when the param is missing", () => {
    expect(normalizeWeekStart(undefined, "2025-01-06")).toBe("2025-01-06");
  });
  it("falls back when the param is invalid", () => {
    expect(normalizeWeekStart("not-a-date", "2025-01-06")).toBe("2025-01-06");
  });
});

describe("formatWeekRange", () => {
  it("formats a week that spans two months", () => {
    expect(formatWeekRange("2025-05-26")).toBe("May 26 – Jun 1");
  });
});
