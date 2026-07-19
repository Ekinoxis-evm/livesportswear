import { formatInTimeZone } from "date-fns-tz";
import { toCsv, type CsvCell } from "@/lib/csv";
import { workedHours, stampStatus } from "@/lib/attendance";

/**
 * Pure builder for the Daily Report CSV attachment: every client event of the
 * day plus every check-in with worked hours. Takes plain rows + the store TZ,
 * returns the file content. The reason/product columns exist from day one so
 * the file shape never changes when richer events start flowing.
 */

export type ReportEvent = {
  employeeName: string;
  attended_at: string; // ISO
  kind?: string | null; // walkin | return (defaults to walkin)
  sold: boolean;
  got_contact: boolean;
  reasons?: string[] | null;
  products?: { title: string; sku?: string | null }[] | null;
  note?: string | null;
  orderName?: string | null; // linked Shopify order, e.g. "#1234"
  orderTotal?: number | null;
  customerName?: string | null;
};

export const orderLabel = (e: Pick<ReportEvent, "orderName" | "orderTotal">) =>
  e.orderName
    ? e.orderTotal != null
      ? `${e.orderName} ($${e.orderTotal.toFixed(2)})`
      : e.orderName
    : "";

export const productLabel = (p: { title: string; sku?: string | null }) =>
  p.sku ? `${p.title} [${p.sku}]` : p.title;

export type ReportCheckin = {
  employeeName: string;
  arrived_at: string;
  left_at: string | null;
  entry_validated_at: string | null;
  entry_self: boolean;
  exit_validated_at: string | null;
  exit_self: boolean;
  exit_missed?: boolean;
  breakMinutes?: number;
};

export function buildDayReportCsv({
  businessDate,
  events,
  checkins,
  tz,
}: {
  businessDate: string;
  events: ReportEvent[];
  checkins: ReportCheckin[];
  tz: string;
}): string {
  const time = (iso: string) => formatInTimeZone(new Date(iso), tz, "HH:mm");

  const eventRows: CsvCell[][] = events.map((e) => [
    time(e.attended_at),
    e.employeeName,
    e.kind ?? "walkin",
    e.sold ? "sold" : "no sale",
    orderLabel(e),
    e.customerName ?? "",
    (e.reasons ?? []).join("; "),
    (e.products ?? []).map(productLabel).join("; "),
    e.note ?? "",
    e.got_contact ? "yes" : "no",
  ]);

  const checkinRows: CsvCell[][] = checkins.map((c) => [
    c.employeeName,
    time(c.arrived_at),
    c.left_at ? time(c.left_at) : "",
    workedHours(c.arrived_at, c.left_at) ?? "",
    c.breakMinutes && c.breakMinutes > 0 ? c.breakMinutes : "",
    stampStatus({ at: c.arrived_at, validatedAt: c.entry_validated_at, self: c.entry_self }),
    stampStatus({
      at: c.left_at,
      validatedAt: c.exit_validated_at,
      self: c.exit_self,
      missed: c.exit_missed,
    }),
  ]);

  return toCsv([
    [`Daily Report ${businessDate}`],
    [],
    ["Client events"],
    ["Time", "Employee", "Kind", "Result", "Order", "Customer", "Reasons", "Products", "Note", "Got contact"],
    ...eventRows,
    [],
    ["Check-ins"],
    ["Employee", "In", "Out", "Hours", "Break min", "Entry status", "Exit status"],
    ...checkinRows,
  ]);
}
