import { describe, expect, it } from "vitest";
import { buildDayReportCsv } from "@/lib/day-report-csv";

const tz = "America/New_York";

describe("buildDayReportCsv", () => {
  it("renders both sections with store-local times", () => {
    const csv = buildDayReportCsv({
      businessDate: "2026-07-09",
      tz,
      events: [
        {
          employeeName: "Maryna",
          attended_at: "2026-07-09T15:30:00Z", // 11:30 EDT
          sold: true,
          got_contact: true,
          orderName: "#1042",
          orderTotal: 118.4,
          customerName: "Anastasia B",
        },
        {
          employeeName: "Veriana",
          attended_at: "2026-07-09T16:00:00Z",
          sold: false,
          got_contact: false,
          reasons: ["No size", "No color"],
          note: "wanted the blue one",
        },
      ],
      checkins: [
        {
          employeeName: "Maryna",
          arrived_at: "2026-07-09T13:30:00Z", // 09:30 EDT
          left_at: "2026-07-09T21:30:00Z", // 17:30 EDT → 8h
          entry_validated_at: "2026-07-09T13:30:00Z",
          entry_self: false,
          exit_validated_at: "2026-07-09T21:30:00Z",
          exit_self: false,
          breakMinutes: 25,
        },
      ],
    });

    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Daily Report 2026-07-09");
    expect(lines).toContain(
      "11:30,Maryna,walkin,sold,#1042 ($118.40),Anastasia B,,,,yes",
    );
    expect(lines).toContain(
      "12:00,Veriana,walkin,no sale,,,No size; No color,,wanted the blue one,no",
    );
    expect(lines).toContain("Maryna,09:30,17:30,8,25,validated,validated");
  });

  it("leaves out-time and hours empty while still on the floor", () => {
    const csv = buildDayReportCsv({
      businessDate: "2026-07-09",
      tz,
      events: [],
      checkins: [
        {
          employeeName: "Estefani",
          arrived_at: "2026-07-09T14:00:00Z",
          left_at: null,
          entry_validated_at: "2026-07-09T14:00:00Z",
          entry_self: false,
          exit_validated_at: null,
          exit_self: false,
        },
      ],
    });
    expect(csv.split("\r\n")).toContain("Estefani,10:00,,,,validated,none");
  });

  it("quotes fields containing commas", () => {
    const csv = buildDayReportCsv({
      businessDate: "2026-07-09",
      tz,
      events: [
        {
          employeeName: "Maryna",
          attended_at: "2026-07-09T15:00:00Z",
          sold: false,
          got_contact: false,
          note: "too small, wrong color",
        },
      ],
      checkins: [],
    });
    expect(csv).toContain('"too small, wrong color"');
  });
});
