import { describe, it, expect } from "vitest";
import {
  sprintStart,
  sprintEnd,
  sprintRange,
  payday,
  submissionCutoff,
  isLateSubmission,
} from "@/lib/scheduling/payroll";

const ANCHOR = "2026-06-22"; // Monday, start of sprint 1

describe("sprintStart", () => {
  it("returns the anchor for a date in the first week", () => {
    expect(sprintStart(ANCHOR, "2026-06-25")).toBe("2026-06-22");
  });
  it("keeps the same sprint in the second week", () => {
    expect(sprintStart(ANCHOR, "2026-07-02")).toBe("2026-06-22");
  });
  it("advances to the next sprint", () => {
    expect(sprintStart(ANCHOR, "2026-07-08")).toBe("2026-07-06");
  });
  it("handles dates before the anchor", () => {
    expect(sprintStart(ANCHOR, "2026-06-15")).toBe("2026-06-08");
  });
});

describe("sprintEnd / sprintRange", () => {
  it("ends on the second Sunday", () => {
    expect(sprintEnd(ANCHOR, "2026-06-25")).toBe("2026-07-05");
  });
  it("returns the full 14-day range", () => {
    expect(sprintRange(ANCHOR, "2026-06-25")).toEqual({
      start: "2026-06-22",
      end: "2026-07-05",
    });
  });
});

describe("payday", () => {
  it("is the Friday after the sprint's last Sunday", () => {
    expect(payday(ANCHOR, "2026-06-25")).toBe("2026-07-10");
  });
});

describe("submissionCutoff", () => {
  it("is the Friday before the requested week", () => {
    expect(submissionCutoff("2026-06-29")).toBe("2026-06-26");
  });
});

describe("isLateSubmission", () => {
  it("is false when submitted on or before the cutoff Friday", () => {
    expect(isLateSubmission("2026-06-29", "2026-06-25T10:00:00Z")).toBe(false);
  });
  it("is true when submitted after the cutoff", () => {
    expect(isLateSubmission("2026-06-29", "2026-06-27T08:00:00Z")).toBe(true);
  });
});
