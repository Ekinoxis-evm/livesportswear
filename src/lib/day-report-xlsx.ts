import ExcelJS from "exceljs";
import { formatInTimeZone } from "date-fns-tz";
import { workedHours, stampStatus } from "@/lib/attendance";
import { formatDuration } from "@/lib/conversion";
import {
  productLabel,
  type ReportEvent,
  type ReportCheckin,
  type DayReportTotals,
} from "@/lib/day-report-csv";

/** One salesperson's day, numeric — feeds both the email table and this sheet. */
export type ReportEmployee = {
  name: string;
  gross: number; // full-price sales value (the headline)
  net: number;
  orders: number;
  avgTicket: number;
  attended: number;
  sold: number;
  conversion: number; // 0..1
  contacts: number;
  avgSeconds: number | null; // avg attend time
  hours: number;
};

export type DayReportXlsxInput = {
  storeName: string;
  businessDate: string;
  tz: string;
  currency: string;
  totals: DayReportTotals;
  employees: ReportEmployee[];
  events: ReportEvent[];
  checkins: ReportCheckin[];
};

const MONEY = '#,##0.00';
const PCT = '0%';

function headerRow(ws: ExcelJS.Worksheet, labels: string[]) {
  const row = ws.addRow(labels);
  row.font = { bold: true };
}

/**
 * The daily report as a real multi-sheet Excel workbook — opens cleanly in
 * Excel and Google Sheets with native number/currency formatting (unlike the
 * old bespoke XML). Money lands in numeric cells so totals/sorting just work.
 */
export async function buildDayReportXlsx(d: DayReportXlsxInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LIVE! Store";
  const time = (iso: string) => formatInTimeZone(new Date(iso), d.tz, "HH:mm");

  // 1 — Summary
  const s = wb.addWorksheet("Summary");
  s.columns = [{ width: 26 }, { width: 18 }];
  headerRow(s, [`Daily Report — ${d.storeName}`, d.businessDate]);
  s.addRow([]);
  const money = (label: string, v: number | null) => {
    const row = s.addRow([label, v ?? 0]);
    row.getCell(2).numFmt = MONEY;
  };
  const t = d.totals;
  money("Net sales", t.netSales);
  money("Gross sales", t.grossSales);
  money("Discounts", t.discounts);
  money("Returns value", t.returnsValue);
  s.addRow(["Orders", t.orders ?? 0]);
  money("Cash received", t.cashNet);
  money("Card received", t.cardNet);
  money("Refunds total", t.refundsTotal);
  s.addRow(["Refunds count", t.refundsCount ?? 0]);
  s.addRow([]);
  s.addRow(["Attended", t.attended]);
  s.addRow(["Sold", t.sold]);
  s.addRow(["Conversion", t.conversionPct]);
  s.addRow(["Contacts", t.contacts]);
  s.addRow(["Returns", t.returns]);
  s.addRow(["Avg time / client", t.avgTimeLabel]);
  s.addRow([`Currency: ${d.currency}`]);

  // 2 — Employees
  const e = wb.addWorksheet("Employees");
  e.columns = [
    { width: 22 },
    { width: 12 },
    { width: 12 },
    { width: 9 },
    { width: 12 },
    { width: 10 },
    { width: 8 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 8 },
  ];
  headerRow(e, [
    "Employee",
    "Sales",
    "Net sales",
    "Orders",
    "Avg ticket",
    "Attended",
    "Sold",
    "Conversion",
    "Contacts",
    "Avg time",
    "Hours",
  ]);
  for (const p of d.employees) {
    const row = e.addRow([
      p.name,
      p.gross,
      p.net,
      p.orders,
      p.avgTicket,
      p.attended,
      p.sold,
      p.conversion,
      p.contacts,
      formatDuration(p.avgSeconds),
      p.hours,
    ]);
    row.getCell(2).numFmt = MONEY;
    row.getCell(3).numFmt = MONEY;
    row.getCell(5).numFmt = MONEY;
    row.getCell(8).numFmt = PCT;
  }

  // 3 — Client events
  const ev = wb.addWorksheet("Client events");
  ev.columns = [
    { width: 7 },
    { width: 20 },
    { width: 9 },
    { width: 10 },
    { width: 9 },
    { width: 16 },
    { width: 12 },
    { width: 20 },
    { width: 24 },
    { width: 24 },
    { width: 24 },
    { width: 9 },
  ];
  headerRow(ev, [
    "Time",
    "Employee",
    "Kind",
    "Return type",
    "Result",
    "Order",
    "Order total",
    "Customer",
    "Reasons",
    "Products",
    "Note",
    "Contact",
  ]);
  for (const x of d.events) {
    const row = ev.addRow([
      time(x.attended_at),
      x.employeeName,
      x.kind ?? "walkin",
      x.returnType ?? "",
      x.sold ? "sold" : "no sale",
      x.orderName
        ? x.orderCount && x.orderCount > 1
          ? `${x.orderName} +${x.orderCount - 1} more`
          : x.orderName
        : "",
      x.orderTotal ?? null,
      x.customerName ?? "",
      (x.reasons ?? []).join("; "),
      (x.products ?? []).map(productLabel).join("; "),
      x.note ?? "",
      x.got_contact ? "yes" : "no",
    ]);
    if (x.orderTotal != null) row.getCell(7).numFmt = MONEY;
  }

  // 4 — Check-ins
  const c = wb.addWorksheet("Check-ins");
  c.columns = [
    { width: 22 },
    { width: 7 },
    { width: 7 },
    { width: 8 },
    { width: 10 },
    { width: 14 },
    { width: 14 },
  ];
  headerRow(c, ["Employee", "In", "Out", "Hours", "Break min", "Entry status", "Exit status"]);
  for (const x of d.checkins) {
    c.addRow([
      x.employeeName,
      time(x.arrived_at),
      x.left_at ? time(x.left_at) : "",
      workedHours(x.arrived_at, x.left_at) ?? "",
      x.breakMinutes && x.breakMinutes > 0 ? x.breakMinutes : "",
      stampStatus({ at: x.arrived_at, validatedAt: x.entry_validated_at, self: x.entry_self }),
      stampStatus({
        at: x.left_at,
        validatedAt: x.exit_validated_at,
        self: x.exit_self,
        missed: x.exit_missed,
      }),
    ]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
