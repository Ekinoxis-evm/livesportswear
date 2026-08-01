import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSafe } from "@/lib/resend";
import { businessDate } from "@/lib/business-date";
import { resolveRecipients } from "@/lib/report-recipients";
import { totals, byPerson, formatPct, formatDuration, type ConversionTotals } from "@/lib/conversion";
import { breakMinutes, type BreakRow } from "@/lib/breaks";
import { workedHours } from "@/lib/attendance";
import { getDaySalesCached, getDayOrdersCached } from "@/lib/shopify-day-cache";
import { fetchDayTenders, type DaySales } from "@/lib/shopify";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { dayRangeInTz, normalizeStaffId } from "@/lib/shopify-range";
import { summarizeTenders, type TenderSummary } from "@/lib/tenders";
import {
  buildDayReportCsv,
  type ReportCheckin,
  type ReportEvent,
  type DayReportTotals,
} from "@/lib/day-report-csv";
import { buildDayReportXlsx, type ReportEmployee } from "@/lib/day-report-xlsx";
import { renderToBuffer } from "@react-pdf/renderer";
import { DayReportPdf } from "@/lib/emails/day-report-pdf";
import { formatMoney, formatMoneyExact } from "@/lib/commission";
import { weekdayName } from "@/lib/weekdays";
import { shortDate } from "@/lib/format-date";
import { DayReportEmail, type DayReportRow } from "@/lib/emails/day-report";
import { joinNames } from "@/lib/format-list";
import type { ActionResult } from "@/server/shared";

/**
 * The editable recipient list for a location's daily report (store_report_recipients),
 * seeded from the admins at migration time and freely edited since. Exported so
 * the admin UI reads the same source. Order is stable by created_at.
 */
export async function managedReportEmails(locationId: string): Promise<string[]> {
  const service = createServiceClient();
  const { data } = await service
    .from("store_report_recipients")
    .select("email")
    .eq("location_id", locationId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => r.email);
}

/**
 * Everyone who receives the daily report — the managed list. The
 * STORE_REPORT_EMAIL env fallback applies only when the list is empty, so a
 * store is never left unable to receive its report.
 */
async function reportRecipients(locationId: string): Promise<string[]> {
  const emails = await managedReportEmails(locationId);
  const fallback = process.env.STORE_REPORT_EMAIL;
  return emails.length ? emails : fallback ? [fallback] : [];
}

/** What the kiosk shows in the draft dialog before confirming the close. */
export type CloseDayDraft = {
  businessDateLabel: string;
  subject: string;
  recipients: string[];
  attended: number;
  sold: number;
  contacts: number;
  conversionPct: string;
  returns: number;
  returnExtraSales: number;
  shopifySales: string | null; // formatted NET money-in for the day
  grossSales: string | null;
  discounts: string | null;
  returnsValue: string | null;
  taxes: string | null; // formatted with leading plus
  totalSales: string | null; // formatted net + taxes (Shopify "Total sales")
  shopifyOrders: number | null;
  cashReceived: string | null;
  refunds: string | null; // "-$41.73 · 1" when any
  eventCount: number;
  checkinCount: number;
};

type DayReportData = {
  locName: string;
  tz: string;
  bd: string;
  t: ConversionTotals;
  perPerson: DayReportRow[];
  shopify: DaySales | null;
  tenders: TenderSummary | null;
  recipients: string[];
  subject: string;
  csv: string;
  perEmployee: ReportEmployee[];
  reportEvents: ReportEvent[];
  reportCheckins: ReportCheckin[];
  totals: DayReportTotals;
  currency: string;
  eventCount: number;
  checkinCount: number;
};

export async function buildDayReportData(locationId: string): Promise<DayReportData> {
  const service = createServiceClient();

  const { data: loc } = await service
    .from("locations")
    .select("name, timezone")
    .eq("id", locationId)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  const locName = loc?.name ?? "Store";
  const bd = businessDate(tz);

  const dayRange = dayRangeInTz(bd, tz);
  const tendersPromise: Promise<TenderSummary | null> = isShopifyConfigured()
    ? fetchDayTenders(dayRange.start, dayRange.endExclusive)
        .then(summarizeTenders)
        .catch(() => null)
    : Promise.resolve(null);

  const [
    { data: eventRows },
    { data: checkinRows },
    { data: breakRows },
    { data: empRows },
    shopify,
    dayOrders,
    tenders,
    recipients,
  ] = await Promise.all([
    service
      .from("client_events")
      .select(
        "employee_id, attended_at, kind, return_type, sold, got_contact, served_seconds, reasons, note, products, shopify_order_name, order_total, linked_orders, customer_name, employees(name)",
      )
      .eq("location_id", locationId)
      .eq("business_date", bd)
      .order("attended_at"),
    service
      .from("floor_checkins")
      .select(
        "employee_id, arrived_at, left_at, entry_validated_at, entry_self, exit_validated_at, exit_self, exit_missed, employees(name)",
      )
      .eq("location_id", locationId)
      .eq("business_date", bd)
      .order("arrived_at"),
    service
      .from("floor_breaks")
      .select("employee_id, started_at, ended_at")
      .eq("location_id", locationId)
      .eq("business_date", bd),
    service
      .from("employees")
      .select("id, name, shopify_staff_id")
      .eq("location_id", locationId)
      .eq("active", true),
    getDaySalesCached(bd, tz),
    getDayOrdersCached(bd, tz),
    tendersPromise,
    reportRecipients(locationId),
  ]);

  const events = eventRows ?? [];
  const checkins = checkinRows ?? [];
  // Break minutes per employee; an open break is clocked to "now" so a report
  // built before the break ends still counts the time so far.
  const now = new Date().toISOString();
  const breaksBy = new Map<string, BreakRow[]>();
  for (const b of breakRows ?? []) {
    const list = breaksBy.get(b.employee_id) ?? [];
    list.push({ startedAt: b.started_at, endedAt: b.ended_at });
    breaksBy.set(b.employee_id, list);
  }
  const nameOf = (row: { employees: { name: string } | null }) =>
    row.employees?.name ?? "Unknown";

  const t = totals(events);
  const currency = shopify?.currency ?? "USD";
  const personName = new Map<string, string>();
  for (const e of events) personName.set(e.employee_id, nameOf(e));

  // Per-employee, merged across three sources keyed on employee id: conversion
  // counts (byPerson), the day's Shopify net + orders attributed to that rep's
  // POS login (via shopify_staff_id), and worked hours from check-ins.
  const roster = empRows ?? [];
  const rosterName = new Map(roster.map((e) => [e.id, e.name]));
  const staffIdToEmpId = new Map<string, string>();
  for (const e of roster) {
    if (e.shopify_staff_id) staffIdToEmpId.set(normalizeStaffId(e.shopify_staff_id), e.id);
  }
  const salesByEmp = new Map<string, { gross: number; net: number; orders: number }>();
  for (const o of dayOrders ?? []) {
    if (o.sourceName !== "pos") continue; // real POS sales only (skip drafts)
    if (!o.staffId) continue;
    const empId = staffIdToEmpId.get(o.staffId);
    if (!empId) continue;
    const acc = salesByEmp.get(empId) ?? { gross: 0, net: 0, orders: 0 };
    acc.gross += o.gross;
    acc.net += o.net;
    acc.orders += 1;
    salesByEmp.set(empId, acc);
  }
  const hoursByEmp = new Map<string, number>();
  for (const c of checkins) {
    const h = workedHours(c.arrived_at, c.left_at);
    if (h != null) hoursByEmp.set(c.employee_id, (hoursByEmp.get(c.employee_id) ?? 0) + h);
  }
  const convByEmp = new Map(byPerson(events).map((p) => [p.employeeId, p]));
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const nameFor = (id: string) => personName.get(id) ?? rosterName.get(id) ?? "Unknown";
  const empIds = new Set<string>([
    ...convByEmp.keys(),
    ...salesByEmp.keys(),
    ...hoursByEmp.keys(),
  ]);
  const perEmployee: ReportEmployee[] = [...empIds]
    .map((id) => {
      const conv = convByEmp.get(id);
      const sales = salesByEmp.get(id);
      const orders = sales?.orders ?? 0;
      const gross = round2(sales?.gross ?? 0);
      const net = round2(sales?.net ?? 0);
      return {
        name: nameFor(id),
        gross,
        net,
        orders,
        avgTicket: orders ? round2(gross / orders) : 0,
        attended: conv?.attended ?? 0,
        sold: conv?.sold ?? 0,
        conversion: conv?.conversion ?? 0,
        contacts: conv?.contacts ?? 0,
        avgSeconds: conv?.avgServedSeconds ?? null,
        hours: round2(hoursByEmp.get(id) ?? 0),
      };
    })
    .sort((a, b) => b.gross - a.gross || b.sold - a.sold || a.name.localeCompare(b.name));

  const perPerson: DayReportRow[] = perEmployee.map((p) => ({
    name: p.name,
    attended: p.attended,
    sold: p.sold,
    conversionPct: p.attended > 0 ? formatPct(p.conversion) : "—",
    contacts: p.contacts,
    orders: p.orders,
    gross: formatMoneyExact(p.gross, currency),
    net: formatMoneyExact(p.net, currency),
    avgTicket: formatMoneyExact(p.avgTicket, currency),
    hours: p.hours,
  }));

  const reportEvents: ReportEvent[] = events.map((e) => ({
    employeeName: nameOf(e),
    attended_at: e.attended_at,
    kind: e.kind,
    returnType: e.return_type,
    sold: e.sold,
    got_contact: e.got_contact,
    reasons: e.reasons,
    products: (e.products as { title: string; sku?: string | null }[] | null) ?? null,
    note: e.note,
    orderName: e.shopify_order_name,
    orderTotal: e.order_total != null ? Number(e.order_total) : null,
    orderCount: Array.isArray(e.linked_orders)
      ? e.linked_orders.length
      : e.shopify_order_name
        ? 1
        : 0,
    customerName: e.customer_name,
  }));
  const reportCheckins: ReportCheckin[] = checkins.map((c) => ({
    employeeName: nameOf(c),
    arrived_at: c.arrived_at,
    left_at: c.left_at,
    entry_validated_at: c.entry_validated_at,
    entry_self: c.entry_self,
    exit_validated_at: c.exit_validated_at,
    exit_self: c.exit_self,
    exit_missed: c.exit_missed,
    breakMinutes: breakMinutes(breaksBy.get(c.employee_id) ?? [], now),
  }));

  const reportTotals: DayReportTotals = {
    netSales: shopify?.net ?? null,
    grossSales: shopify?.gross ?? null,
    discounts: shopify?.discounts ?? null,
    returnsValue: shopify?.returns ?? null,
    taxes: shopify?.taxes ?? null,
    totalSales: shopify?.total ?? null,
    orders: shopify?.orders ?? null,
    cashNet: tenders?.cashNet ?? null,
    cardNet: tenders?.cardNet ?? null,
    refundsTotal: tenders?.refundsTotal ?? null,
    refundsCount: tenders?.refundsCount ?? null,
    attended: t.attended,
    sold: t.sold,
    conversionPct: formatPct(t.conversion),
    contacts: t.contacts,
    returns: t.returns,
    avgTimeLabel: formatDuration(t.avgServedSeconds),
  };

  const csv = buildDayReportCsv({
    businessDate: bd,
    tz,
    events: reportEvents,
    checkins: reportCheckins,
  });

  return {
    locName,
    tz,
    bd,
    t,
    perPerson,
    shopify,
    tenders,
    recipients,
    subject: `Daily Report — ${locName} · ${weekdayName(bd)} ${shortDate(bd)}`,
    csv,
    perEmployee,
    reportEvents,
    reportCheckins,
    totals: reportTotals,
    currency,
    eventCount: events.length,
    checkinCount: checkins.length,
  };
}

/**
 * Only someone on today's published schedule who is checked in on the floor
 * may close the day (usually the evening shift).
 */
async function closerEligibility(
  closer: { id: string; location_id: string },
  bd: string,
): Promise<string | null> {
  const service = createServiceClient();
  const [{ data: closerShift }, { data: closerCheckin }] = await Promise.all([
    service
      .from("shifts")
      .select("id, schedules!inner(status)")
      .eq("employee_id", closer.id)
      .eq("date", bd)
      .eq("schedules.status", "published")
      .limit(1)
      .maybeSingle(),
    service
      .from("floor_checkins")
      .select("id")
      .eq("location_id", closer.location_id)
      .eq("business_date", bd)
      .eq("employee_id", closer.id)
      .is("left_at", null)
      .maybeSingle(),
  ]);
  if (!closerShift) return "Only someone with a shift today can close the day.";
  if (!closerCheckin) return "Mark your entry before closing the day.";
  return null;
}

/** The draft the kiosk previews before confirming — same data the send will use. */
export async function closeDayDraftFor(closer: {
  id: string;
  location_id: string;
}): Promise<ActionResult<CloseDayDraft>> {
  const service = createServiceClient();
  const { data: loc } = await service
    .from("locations")
    .select("timezone")
    .eq("id", closer.location_id)
    .maybeSingle();
  const bd = businessDate(loc?.timezone ?? "UTC");

  const ineligible = await closerEligibility(closer, bd);
  if (ineligible) return { ok: false, error: ineligible };

  return reportDraftFor(closer.location_id);
}

/**
 * The same draft without a closer — admin previews a test send, where there is
 * no one "closing" and no eligibility to check. `closeDayDraftFor` adds only
 * that check on top of this.
 */
export async function reportDraftFor(
  locationId: string,
): Promise<ActionResult<CloseDayDraft>> {
  const d = await buildDayReportData(locationId);
  return {
    ok: true,
    data: {
      businessDateLabel: `${weekdayName(d.bd)} · ${shortDate(d.bd)}`,
      subject: d.subject,
      recipients: d.recipients,
      attended: d.t.attended,
      sold: d.t.sold,
      contacts: d.t.contacts,
      conversionPct: formatPct(d.t.conversion),
      returns: d.t.returns,
      returnExtraSales: d.t.returnExtraSales,
      shopifySales:
        d.shopify != null ? formatMoney(d.shopify.net, d.shopify.currency ?? "USD") : null,
      grossSales: d.shopify != null ? formatMoney(d.shopify.gross, d.currency) : null,
      discounts:
        d.shopify != null && d.shopify.discounts > 0
          ? `−${formatMoney(d.shopify.discounts, d.currency)}`
          : null,
      returnsValue:
        d.shopify != null && d.shopify.returns > 0
          ? `−${formatMoney(d.shopify.returns, d.currency)}`
          : null,
      taxes:
        d.shopify != null && d.shopify.taxes > 0
          ? `+${formatMoney(d.shopify.taxes, d.currency)}`
          : null,
      totalSales: d.shopify != null ? formatMoney(d.shopify.total, d.currency) : null,
      shopifyOrders: d.shopify?.orders ?? null,
      cashReceived: d.tenders != null ? formatMoney(d.tenders.cashNet, d.currency) : null,
      refunds:
        d.tenders != null && d.tenders.refundsCount > 0
          ? `${formatMoney(d.tenders.refundsTotal, d.currency)} · ${d.tenders.refundsCount}`
          : null,
      eventCount: d.eventCount,
      checkinCount: d.checkinCount,
    },
  };
}

/**
 * Close the store day as `closer`: same eligibility rule regardless of the
 * caller (portal button or store kiosk) — the closer must be on today's
 * published schedule AND checked in on the floor. Snapshots conversion (and
 * the day's Shopify sales) into store_day_closes and emails the daily report
 * with the full-detail CSV attached. Idempotent on (location, business_date).
 */
export async function closeDayFor(
  closer: { id: string; name: string; location_id: string },
  onlyRecipients?: string[],
  signatories?: string[],
): Promise<ActionResult> {
  const service = createServiceClient();

  const { data: loc } = await service
    .from("locations")
    .select("timezone")
    .eq("id", closer.location_id)
    .maybeSingle();
  const bd = businessDate(loc?.timezone ?? "UTC");

  const ineligible = await closerEligibility(closer, bd);
  if (ineligible) return { ok: false, error: ineligible };

  // A repeat call (double tap, client retry) must not re-email every admin.
  const { data: existing } = await service
    .from("store_day_closes")
    .select("id")
    .eq("location_id", closer.location_id)
    .eq("business_date", bd)
    .maybeSingle();
  if (existing) return { ok: false, error: "The day is already closed." };

  const base = await buildDayReportData(closer.location_id);
  const d = { ...base, recipients: resolveRecipients(base.recipients, onlyRecipients) };

  // Refuse to close with nobody to report to — otherwise the day is marked
  // closed and the report is unsendable forever (no resend path exists).
  if (d.recipients.length === 0) {
    return {
      ok: false,
      error: "No report recipients configured — set up an admin email first.",
    };
  }

  // Plain INSERT so the unique (location, business_date) constraint is the
  // real idempotency guard — two simultaneous closes race the pre-check, and
  // an upsert would let BOTH proceed to email every admin.
  const { error: upErr } = await service.from("store_day_closes").insert({
    location_id: closer.location_id,
    business_date: d.bd,
    closed_by: closer.id,
    attended_count: d.t.attended,
    sold_count: d.t.sold,
    contact_count: d.t.contacts,
    shopify_sales: d.shopify?.net ?? null,
    gross_sales: d.shopify?.gross ?? null,
    discounts: d.shopify?.discounts ?? null,
    returns_value: d.shopify?.returns ?? null,
    cash_sales: d.tenders?.cashNet ?? null,
    currency: d.shopify?.currency ?? null,
  });
  if (upErr) {
    if (upErr.code === "23505") {
      return { ok: false, error: "The day is already closed." };
    }
    return { ok: false, error: upErr.message };
  }

  // The email is signed by everyone the closer picked as on-floor senders;
  // `closed_by` above stays the single recorded closer.
  const signature = joinNames(signatories?.length ? signatories : [closer.name]);
  const send = await sendDayReport(d, signature);
  // The day is already closed; report delivery is best-effort with no resend
  // path, so a silent failure (e.g. an unverified Resend sender) must at least
  // be logged. Recipients are already masked by sendSafe; firstError carries no PII.
  if (send.failed > 0) {
    console.error(
      `[close-day] report delivery: ${send.sent} sent, ${send.failed} failed` +
        (send.firstError ? ` — ${send.firstError}` : ""),
    );
  }
  return { ok: true };
}

/**
 * Build + send today's report as a [TEST] (no store_day_closes row). Shared by
 * the admin and kiosk "Send test report" actions — each wraps this with its own
 * auth/location gate. Surfaces a real delivery failure instead of a false "sent".
 */
export async function sendTestReportFor(
  locationId: string,
  onlyRecipients?: string[],
  signatories?: string[],
): Promise<ActionResult<{ sentTo: number }>> {
  const base = await buildDayReportData(locationId);
  const d = { ...base, recipients: resolveRecipients(base.recipients, onlyRecipients) };
  if (d.recipients.length === 0)
    return { ok: false, error: "No recipients configured — add an email first." };

  const signature = signatories?.length ? joinNames(signatories) : "Test";
  const { sent, failed, firstError } = await sendDayReport(d, signature, { test: true });
  if (sent === 0) return { ok: false, error: firstError ?? "The report could not be sent." };
  if (failed > 0)
    return { ok: false, error: `Sent to ${sent}, but ${failed} failed: ${firstError ?? "unknown error"}` };
  return { ok: true, data: { sentTo: sent } };
}

/**
 * Render the report PDF + email and send it to every recipient in `d`. Shared
 * by the real close (`closeDayFor`) and the admin "Send test report" preview.
 * When `test`, the subject is prefixed `[TEST] ` and NO store_day_closes row is
 * written (the caller of the test path skips the insert entirely).
 */
export async function sendDayReport(
  d: DayReportData,
  closedByName: string,
  opts: { test?: boolean } = {},
): Promise<{ sent: number; failed: number; firstError?: string }> {
  const money = (v: number | null) =>
    v === null ? "—" : formatMoney(v, d.currency);
  const pdf = await renderToBuffer(
    DayReportPdf({
      storeName: d.locName,
      businessDateLabel: `${weekdayName(d.bd)} · ${shortDate(d.bd)}`,
      currency: d.currency,
      tz: d.tz,
      totals: d.totals,
      money,
      events: d.reportEvents,
      checkins: d.reportCheckins,
    }),
  );
  const xlsx = await buildDayReportXlsx({
    storeName: d.locName,
    businessDate: d.bd,
    tz: d.tz,
    currency: d.currency,
    totals: d.totals,
    employees: d.perEmployee,
    events: d.reportEvents,
    checkins: d.reportCheckins,
  });
  const attachments = [
    { filename: `daily-report-${d.bd}.csv`, content: d.csv },
    { filename: `daily-report-${d.bd}.xlsx`, content: xlsx.toString("base64") },
    { filename: `daily-report-${d.bd}.pdf`, content: pdf.toString("base64") },
  ];
  const subject = opts.test ? `[TEST] ${d.subject}` : d.subject;

  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const to of d.recipients) {
    const res = await sendSafe({
      to,
      subject,
      react: DayReportEmail({
        locationName: d.locName,
        businessDate: `${weekdayName(d.bd)} · ${shortDate(d.bd)}`,
        closedByName,
        attended: d.t.attended,
        sold: d.t.sold,
        contacts: d.t.contacts,
        conversionPct: formatPct(d.t.conversion),
        avgTimeLabel: formatDuration(d.t.avgServedSeconds),
        returns: d.t.returns,
        returnExtraSales: d.t.returnExtraSales,
        shopifySales:
          d.shopify != null
            ? formatMoney(d.shopify.net, d.shopify.currency ?? "USD")
            : null,
        grossSales: d.shopify != null ? formatMoney(d.shopify.gross, d.currency) : null,
        discounts:
          d.shopify != null && d.shopify.discounts > 0
            ? `−${formatMoney(d.shopify.discounts, d.currency)}`
            : null,
        returnsValue:
          d.shopify != null && d.shopify.returns > 0
            ? `−${formatMoney(d.shopify.returns, d.currency)}`
            : null,
        shopifyOrders: d.shopify?.orders ?? null,
        cashReceived: d.tenders != null ? money(d.tenders.cashNet) : null,
        cardReceived: d.tenders != null ? money(d.tenders.cardNet) : null,
        refunds:
          d.tenders != null && d.tenders.refundsCount > 0
            ? `${money(d.tenders.refundsTotal)} · ${d.tenders.refundsCount}`
            : null,
        perPerson: d.perPerson,
      }),
      attachments,
    });
    if (res.ok) {
      sent += 1;
    } else {
      failed += 1;
      firstError ??= res.error;
    }
  }
  return { sent, failed, firstError };
}
