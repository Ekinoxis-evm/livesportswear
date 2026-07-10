import { describe, it, expect } from "vitest";
import { stampStatus, workedHours, missedExitInstant } from "@/lib/attendance";

describe("workedHours", () => {
  it("computes decimal hours between arrival and departure", () => {
    expect(workedHours("2026-07-02T14:30:00Z", "2026-07-02T22:30:00Z")).toBe(8);
  });

  it("rounds to a tenth of an hour", () => {
    expect(workedHours("2026-07-02T09:00:00Z", "2026-07-02T17:20:00Z")).toBe(8.3);
  });

  it("is null while the employee is still on the floor", () => {
    expect(workedHours("2026-07-02T09:00:00Z", null)).toBeNull();
  });

  it("is null when the departure precedes the arrival", () => {
    expect(workedHours("2026-07-02T17:00:00Z", "2026-07-02T09:00:00Z")).toBeNull();
  });
});

describe("stampStatus", () => {
  it("is none without a recorded time", () => {
    expect(stampStatus({ at: null, validatedAt: null, self: false })).toBe("none");
  });

  it("is self for a flagged first-in/last-out stamp", () => {
    expect(
      stampStatus({ at: "2026-07-02T09:00:00Z", validatedAt: "2026-07-02T09:00:00Z", self: true }),
    ).toBe("self");
  });

  it("is validated once a coworker attests", () => {
    expect(
      stampStatus({ at: "2026-07-02T09:00:00Z", validatedAt: "2026-07-02T09:05:00Z", self: false }),
    ).toBe("validated");
  });

  it("is pending until someone validates", () => {
    expect(stampStatus({ at: "2026-07-02T09:00:00Z", validatedAt: null, self: false })).toBe(
      "pending",
    );
  });

  it("is missed for a sweep-closed check-out, regardless of other flags", () => {
    expect(
      stampStatus({
        at: "2026-07-02T22:30:00Z",
        validatedAt: null,
        self: false,
        missed: true,
      }),
    ).toBe("missed");
  });
});

describe("missedExitInstant", () => {
  const tz = "America/New_York"; // EDT (UTC-4) on these dates

  it("stamps the published shift end in store-local time", () => {
    expect(
      missedExitInstant("2026-07-08", tz, "22:30:00", "2026-07-08T18:00:00Z"),
    ).toBe("2026-07-09T02:30:00.000Z"); // 22:30 EDT
  });

  it("falls back to the local midnight ending the business day without a shift", () => {
    expect(missedExitInstant("2026-07-08", tz, null, "2026-07-08T18:00:00Z")).toBe(
      "2026-07-09T04:00:00.000Z", // 00:00 EDT on the 9th
    );
  });

  it("never stamps an exit before the arrival (late unscheduled help)", () => {
    // Shift ended 14:00 local but they arrived 18:00 local — midnight wins,
    // otherwise workedHours would be null.
    expect(
      missedExitInstant("2026-07-08", tz, "14:00:00", "2026-07-08T22:00:00Z"),
    ).toBe("2026-07-09T04:00:00.000Z");
  });
});
