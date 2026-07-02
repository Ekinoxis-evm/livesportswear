import { describe, it, expect } from "vitest";
import { stampStatus, workedHours } from "@/lib/attendance";

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
});
