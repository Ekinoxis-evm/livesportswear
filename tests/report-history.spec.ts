import { describe, expect, it } from "vitest";
import { buildReportHistory } from "@/lib/report-history";

const dates = ["2026-08-13", "2026-08-14", "2026-08-15"];

describe("buildReportHistory", () => {
  it("lists newest first", () => {
    const rows = buildReportHistory({ dates, counts: [], closes: [], sends: [] });
    expect(rows.map((r) => r.businessDate)).toEqual([
      "2026-08-15",
      "2026-08-14",
      "2026-08-13",
    ]);
  });

  it("flags a worked day with no send as missing", () => {
    // The five-day outage: clients attended, report never went out.
    const rows = buildReportHistory({
      dates: ["2026-08-14"],
      counts: [
        { businessDate: "2026-08-14", attended: 9, sold: 4, contacts: 2, checkins: 4 },
      ],
      closes: [],
      sends: [],
    });
    expect(rows[0].missing).toBe(true);
    expect(rows[0].closed).toBe(false);
    expect(rows[0].conversion).toBeCloseTo(4 / 9);
  });

  it("does not flag a day nobody worked", () => {
    const rows = buildReportHistory({
      dates: ["2026-08-14"],
      counts: [
        { businessDate: "2026-08-14", attended: 0, sold: 0, contacts: 0, checkins: 0 },
      ],
      closes: [],
      sends: [],
    });
    expect(rows[0].missing).toBe(false);
  });

  it("counts every send and keeps the latest", () => {
    const rows = buildReportHistory({
      dates: ["2026-08-14"],
      counts: [
        { businessDate: "2026-08-14", attended: 3, sold: 1, contacts: 1, checkins: 2 },
      ],
      closes: [],
      sends: [
        { businessDate: "2026-08-14", sentAt: "2026-08-15T02:00:00Z", kind: "resend" },
        { businessDate: "2026-08-14", sentAt: "2026-08-15T09:00:00Z", kind: "resend" },
      ],
    });
    expect(rows[0].sendCount).toBe(2);
    expect(rows[0].lastSentAt).toBe("2026-08-15T09:00:00Z");
    expect(rows[0].missing).toBe(false);
  });

  it("takes sales from the close snapshot", () => {
    const rows = buildReportHistory({
      dates: ["2026-08-09"],
      counts: [
        { businessDate: "2026-08-09", attended: 5, sold: 3, contacts: 2, checkins: 4 },
      ],
      closes: [
        {
          businessDate: "2026-08-09",
          netSales: 1842.5,
          currency: "USD",
          closedAt: "2026-08-10T02:06:00Z",
        },
      ],
      sends: [
        { businessDate: "2026-08-09", sentAt: "2026-08-10T02:06:00Z", kind: "close" },
      ],
    });
    expect(rows[0].netSales).toBe(1842.5);
    expect(rows[0].closed).toBe(true);
  });

  it("leaves sales null when the day was never closed", () => {
    const rows = buildReportHistory({
      dates: ["2026-08-14"],
      counts: [
        { businessDate: "2026-08-14", attended: 4, sold: 2, contacts: 1, checkins: 3 },
      ],
      closes: [],
      sends: [],
    });
    expect(rows[0].netSales).toBeNull();
  });

  it("has no conversion rate over zero clients", () => {
    const rows = buildReportHistory({
      dates: ["2026-08-14"],
      counts: [
        { businessDate: "2026-08-14", attended: 0, sold: 0, contacts: 0, checkins: 2 },
      ],
      closes: [],
      sends: [],
    });
    expect(rows[0].conversion).toBeNull();
  });

  it("de-duplicates repeated dates", () => {
    const rows = buildReportHistory({
      dates: ["2026-08-14", "2026-08-14"],
      counts: [],
      closes: [],
      sends: [],
    });
    expect(rows).toHaveLength(1);
  });
});
