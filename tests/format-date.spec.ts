import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { shortDate, shortDateRange, monthLabel } from "@/lib/format-date";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-07T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("shortDate", () => {
  it("drops the year inside the current year", () => {
    expect(shortDate("2026-07-07")).toBe("Jul 7");
  });
  it("keeps the year outside the current year", () => {
    expect(shortDate("2025-12-31")).toBe("Dec 31, 2025");
  });
});

describe("shortDateRange", () => {
  it("formats a range without years", () => {
    expect(shortDateRange("2026-06-22", "2026-07-05")).toBe("Jun 22 – Jul 5");
  });
  it("collapses a single-day range", () => {
    expect(shortDateRange("2026-07-07", "2026-07-07")).toBe("Jul 7");
  });
});

describe("monthLabel", () => {
  it("names the month without the current year", () => {
    expect(monthLabel("2026-07")).toBe("July");
  });
  it("appends other years", () => {
    expect(monthLabel("2025-11")).toBe("November 2025");
  });
});
