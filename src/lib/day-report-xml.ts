import { formatInTimeZone } from "date-fns-tz";
import { workedHours, stampStatus } from "@/lib/attendance";
import type { ReportCheckin, ReportEvent } from "@/lib/day-report-csv";

/**
 * Pure builder for the Daily Report XML attachment — a generic,
 * self-describing export any system can import. Same source rows as the CSV;
 * money values are NET sales.
 */

export type DayReportTotals = {
  netSales: number | null;
  orders: number | null;
  cashNet: number | null;
  cardNet: number | null;
  refundsTotal: number | null; // negative
  refundsCount: number | null;
  attended: number;
  sold: number;
  conversionPct: string;
  contacts: number;
  returns: number;
};

// XML entity escaping (not HTML sanitization — this is a generated export,
// nothing here is rendered in a browser). The five XML entities plus removal
// of characters that are invalid in XML 1.0 entirely.
const XML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function esc(v: string): string {
  return v
    .replace(/[&<>"']/g, (c) => XML_ENTITIES[c])
    // eslint-disable-next-line no-control-regex -- stripping XML-invalid chars
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function tag(name: string, value: number | string | null, attrs = ""): string {
  if (value === null) return `<${name}${attrs}/>`;
  return `<${name}${attrs}>${esc(String(value))}</${name}>`;
}

export function buildDayReportXml({
  businessDate,
  storeName,
  currency,
  tz,
  totals,
  events,
  checkins,
}: {
  businessDate: string;
  storeName: string;
  currency: string;
  tz: string;
  totals: DayReportTotals;
  events: ReportEvent[];
  checkins: ReportCheckin[];
}): string {
  const time = (iso: string) => formatInTimeZone(new Date(iso), tz, "HH:mm");

  const eventNodes = events
    .map(
      (e) =>
        `    <event time="${esc(time(e.attended_at))}" employee="${esc(e.employeeName)}" kind="${esc(e.kind ?? "walkin")}" sold="${e.sold}" gotContact="${e.got_contact}">` +
        tag("reasons", (e.reasons ?? []).join("; ") || null) +
        tag("products", (e.products ?? []).map((p) => p.title).join("; ") || null) +
        tag("note", e.note || null) +
        `</event>`,
    )
    .join("\n");

  const checkinNodes = checkins
    .map(
      (c) =>
        `    <checkin employee="${esc(c.employeeName)}" in="${esc(time(c.arrived_at))}" out="${c.left_at ? esc(time(c.left_at)) : ""}" hours="${workedHours(c.arrived_at, c.left_at) ?? ""}" breakMinutes="${c.breakMinutes ?? 0}" entryStatus="${esc(stampStatus({ at: c.arrived_at, validatedAt: c.entry_validated_at, self: c.entry_self }))}" exitStatus="${esc(stampStatus({ at: c.left_at, validatedAt: c.exit_validated_at, self: c.exit_self, missed: c.exit_missed }))}"/>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<dayReport date="${esc(businessDate)}" store="${esc(storeName)}" timezone="${esc(tz)}">
  <totals currency="${esc(currency)}">
    ${tag("netSales", totals.netSales)}
    ${tag("orders", totals.orders)}
    ${tag("cashReceived", totals.cashNet)}
    ${tag("card", totals.cardNet)}
    ${tag("refunds", totals.refundsTotal, ` count="${totals.refundsCount ?? 0}"`)}
    ${tag("attended", totals.attended)}
    ${tag("sold", totals.sold)}
    ${tag("conversion", totals.conversionPct)}
    ${tag("contacts", totals.contacts)}
    ${tag("returns", totals.returns)}
  </totals>
  <clientEvents count="${events.length}">
${eventNodes}
  </clientEvents>
  <checkins count="${checkins.length}">
${checkinNodes}
  </checkins>
</dayReport>
`;
}
