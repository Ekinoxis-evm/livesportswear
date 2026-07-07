import { describe, it, expect } from "vitest";
import {
  previousMonth,
  monthRangeInTz,
  ordersSearchQuery,
} from "@/lib/shopify-range";

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

describe("ordersSearchQuery", () => {
  it("bounds the range and excludes cancelled orders", () => {
    const q = ordersSearchQuery(
      "2026-07-01T04:00:00.000Z",
      "2026-08-01T04:00:00.000Z",
    );
    expect(q).toBe(
      "created_at:>='2026-07-01T04:00:00.000Z' created_at:<'2026-08-01T04:00:00.000Z' -status:cancelled",
    );
  });
});
