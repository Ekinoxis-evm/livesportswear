import { describe, expect, it } from "vitest";
import {
  breakMinutes,
  openBreak,
  overBreakBudget,
  BREAK_BUDGET_MINUTES,
} from "@/lib/breaks";

const NOW = "2026-07-10T16:00:00Z";

describe("openBreak", () => {
  it("finds the ongoing break", () => {
    const open = { startedAt: "2026-07-10T15:40:00Z", endedAt: null };
    expect(
      openBreak([{ startedAt: "2026-07-10T12:00:00Z", endedAt: "2026-07-10T12:15:00Z" }, open]),
    ).toBe(open);
  });

  it("is null when every break is closed", () => {
    expect(
      openBreak([{ startedAt: "2026-07-10T12:00:00Z", endedAt: "2026-07-10T12:15:00Z" }]),
    ).toBeNull();
  });
});

describe("breakMinutes", () => {
  it("is zero with no breaks", () => {
    expect(breakMinutes([], NOW)).toBe(0);
  });

  it("sums multiple closed breaks", () => {
    expect(
      breakMinutes(
        [
          { startedAt: "2026-07-10T12:00:00Z", endedAt: "2026-07-10T12:10:00Z" },
          { startedAt: "2026-07-10T14:00:00Z", endedAt: "2026-07-10T14:12:00Z" },
        ],
        NOW,
      ),
    ).toBe(22);
  });

  it("clocks an open break to now", () => {
    expect(breakMinutes([{ startedAt: "2026-07-10T15:45:00Z", endedAt: null }], NOW)).toBe(15);
  });

  it("clamps an open break that starts after now to zero", () => {
    expect(breakMinutes([{ startedAt: "2026-07-10T16:05:00Z", endedAt: null }], NOW)).toBe(0);
  });

  it("rounds to whole minutes", () => {
    expect(
      breakMinutes([{ startedAt: "2026-07-10T12:00:00Z", endedAt: "2026-07-10T12:10:31Z" }], NOW),
    ).toBe(11);
    expect(
      breakMinutes([{ startedAt: "2026-07-10T12:00:00Z", endedAt: "2026-07-10T12:10:29Z" }], NOW),
    ).toBe(10);
  });
});

describe("overBreakBudget", () => {
  it("is false at exactly the budget and true past it", () => {
    expect(overBreakBudget(BREAK_BUDGET_MINUTES)).toBe(false);
    expect(overBreakBudget(BREAK_BUDGET_MINUTES + 1)).toBe(true);
  });
});
