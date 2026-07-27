import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildDayReportXlsx, type DayReportXlsxInput } from "@/lib/day-report-xlsx";

const input: DayReportXlsxInput = {
  storeName: "Test Store",
  businessDate: "2026-07-20",
  tz: "America/New_York",
  currency: "USD",
  totals: {
    netSales: 100,
    grossSales: 120,
    discounts: 20,
    returnsValue: 0,
    orders: 3,
    cashNet: 50,
    cardNet: 50,
    refundsTotal: 0,
    refundsCount: 0,
    attended: 5,
    sold: 3,
    conversionPct: "60%",
    contacts: 2,
    returns: 1,
    avgTimeLabel: "3:20",
  },
  employees: [
    { name: "Ana", gross: 120, net: 100, orders: 2, avgTicket: 50, attended: 3, sold: 2, conversion: 0.66, contacts: 1, avgSeconds: 200, hours: 7.5 },
  ],
  events: [
    {
      employeeName: "Ana",
      attended_at: "2026-07-20T15:00:00Z",
      kind: "return",
      returnType: "exchange",
      sold: false,
      got_contact: false,
    },
  ],
  checkins: [
    {
      employeeName: "Ana",
      arrived_at: "2026-07-20T13:00:00Z",
      left_at: "2026-07-20T21:00:00Z",
      entry_validated_at: null,
      entry_self: false,
      exit_validated_at: null,
      exit_self: false,
    },
  ],
};

describe("buildDayReportXlsx", () => {
  it("produces a valid workbook with the four sheets and numeric money cells", async () => {
    const buf = await buildDayReportXlsx(input);
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // xlsx = zip

    const wb = new ExcelJS.Workbook();
    // Cast bridges a @types/node Buffer-generic vs exceljs mismatch (test-only).
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Summary",
      "Employees",
      "Client events",
      "Check-ins",
    ]);

    const emp = wb.getWorksheet("Employees")!;
    expect(emp.getRow(2).getCell(1).value).toBe("Ana");
    expect(emp.getRow(2).getCell(2).value).toBe(120); // gross (Sales), a real number
    expect(emp.getRow(2).getCell(3).value).toBe(100); // net is a real number

    const events = wb.getWorksheet("Client events")!;
    expect(events.getRow(2).getCell(4).value).toBe("exchange"); // return type surfaced
  });
});
