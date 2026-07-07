import { describe, it, expect } from "vitest";
import {
  previousMonth,
  monthRangeInTz,
  dayRangeInTz,
  weekRangeInTz,
  normalizeStaffId,
} from "@/lib/shopify-range";
import { weekdayName } from "@/lib/weekdays";

describe("previousMonth", () => {
  it("steps back within a year", () => {
    expect(previousMonth("2026-07")).toBe("2026-06");
  });
  it("wraps January into the prior December", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});

describe("monthRangeInTz", () => {
  it("anchors month boundaries to the store's timezone", () => {
    const r = monthRangeInTz("2026-07", "America/New_York");
    expect(r.start).toBe("2026-07-01T04:00:00.000Z"); // EDT is UTC-4
    expect(r.endExclusive).toBe("2026-08-01T04:00:00.000Z");
  });

  it("wraps December into the next year", () => {
    const r = monthRangeInTz("2026-12", "UTC");
    expect(r.start).toBe("2026-12-01T00:00:00.000Z");
    expect(r.endExclusive).toBe("2027-01-01T00:00:00.000Z");
  });

  it("handles the EST/EDT boundary months", () => {
    const r = monthRangeInTz("2026-01", "America/New_York");
    expect(r.start).toBe("2026-01-01T05:00:00.000Z"); // EST is UTC-5
  });
});

describe("dayRangeInTz", () => {
  it("anchors a store day to its timezone", () => {
    const r = dayRangeInTz("2026-07-07", "America/New_York");
    expect(r.start).toBe("2026-07-07T04:00:00.000Z");
    expect(r.endExclusive).toBe("2026-07-08T04:00:00.000Z");
  });
  it("wraps month boundaries", () => {
    const r = dayRangeInTz("2026-07-31", "UTC");
    expect(r.endExclusive).toBe("2026-08-01T00:00:00.000Z");
  });
});

describe("weekRangeInTz", () => {
  it("spans Monday to the next Monday in the store's timezone", () => {
    const r = weekRangeInTz("2026-07-06", "America/New_York");
    expect(r.start).toBe("2026-07-06T04:00:00.000Z");
    expect(r.endExclusive).toBe("2026-07-13T04:00:00.000Z");
  });
});

describe("weekdayName", () => {
  it("names the weekday of a date string", () => {
    expect(weekdayName("2026-07-07")).toBe("Tuesday");
    expect(weekdayName("2026-07-06")).toBe("Monday");
    expect(weekdayName("2026-07-12")).toBe("Sunday");
  });
});

describe("normalizeStaffId", () => {
  it("extracts the numeric tail from a StaffMember GID", () => {
    expect(normalizeStaffId("gid://shopify/StaffMember/91389034721")).toBe(
      "91389034721",
    );
  });
  it("passes plain numeric ids through", () => {
    expect(normalizeStaffId("91389034721")).toBe("91389034721");
  });
});
