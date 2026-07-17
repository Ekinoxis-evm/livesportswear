import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSafe } from "@/lib/resend";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson, formatPct, type ConversionTotals } from "@/lib/conversion";
import { breakMinutes, type BreakRow } from "@/lib/breaks";
import { getDaySalesCached } from "@/lib/shopify-day-cache";
import { fetchDayTenders, type DaySales } from "@/lib/shopify";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { dayRangeInTz } from "@/lib/shopify-range";
import { summarizeTenders, type TenderSummary } from "@/lib/tenders";
import { buildDayReportCsv, type ReportCheckin, type ReportEvent } from "@/lib/day-report-csv";
import { buildDayReportXml, type DayReportTotals } from "@/lib/day-report-xml";
import { renderToBuffer } from "@react-pdf/renderer";
import { DayReportPdf } from "@/lib/emails/day-report-pdf";
import { formatMoney } from "@/lib/commission";
import { weekdayName } from "@/lib/weekdays";
import { shortDate } from "@/lib/format-date";
import { DayReportEmail, type DayReportRow } from "@/lib/emails/day-report";
import type { ActionResult } from "@/server/shared";

/**
 * Emails of admins who should receive THIS location's daily report: master
 * admins always; location-scoped admins only when admin_locations maps them
 * to the location (a scoped admin must never see another store's numbers).
 */
async function reportRecipients(locationId: string): Promise<string[]> {
  const service = createServiceClient();
  const [{ data }, { data: mappings }] = await Promise.all([
    service.auth.admin.listUsers(),
    service.from("admin_locations").select("admin_user_id").eq("location_id", locationId),
  ]);
  const allowed = new Set((mappings ?? []).map((m) => m.admin_user_id));
  const users = data?.users ?? [];
  const recipients = users.filter((u) => {
    const meta = u.app_metadata as { role?: string; admin_scope?: string } | undefined;
    if (meta?.role !== "admin") return false;
    if (meta.admin_scope === "location") return allowed.has(u.id);
    return true; // master admin (no scope claim, or 'master')
  });
  const emails = recipients.map((u) => u.email).filter((e): e is string => Boolean(e));
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
  xml: string;
  reportEvents: ReportEvent[];
  reportCheckins: ReportCheckin[];
  totals: DayReportTotals;
  currency: string;
  eventCount: number;
  checkinCount: number;
};

async function buildDayReportData(locationId: string): Promise<DayReportData> {
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

  const [{ data: eventRows }, { data: checkinRows }, { data: breakRows }, shopify, tenders, recipients] =
    await Promise.all([
      service
        .from("client_events")
        .select(
          "employee_id, attended_at, kind, sold, got_contact, reasons, note, products, employees(name)",
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
      getDaySalesCached(bd, tz),
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
  const personName = new Map<string, string>();
  for (const e of events) personName.set(e.employee_id, nameOf(e));
  const perPerson: DayReportRow[] = byPerson(events).map((p) => ({
    name: personName.get(p.employeeId) ?? "Unknown",
    attended: p.attended,
    sold: p.sold,
    conversionPct: formatPct(p.conversion),
  }));

  const reportEvents: ReportEvent[] = events.map((e) => ({
    employeeName: nameOf(e),
    attended_at: e.attended_at,
    kind: e.kind,
    sold: e.sold,
    got_contact: e.got_contact,
    reasons: e.reasons,
    products: (e.products as { title: string; sku?: string | null }[] | null) ?? null,
    note: e.note,
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

  const currency = shopify?.currency ?? "USD";
  const reportTotals: DayReportTotals = {
    netSales: shopify?.net ?? null,
    grossSales: shopify?.gross ?? null,
    discounts: shopify?.discounts ?? null,
    returnsValue: shopify?.returns ?? null,
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
  };

  const csv = buildDayReportCsv({
    businessDate: bd,
    tz,
    events: reportEvents,
    checkins: reportCheckins,
  });
  const xml = buildDayReportXml({
    businessDate: bd,
    storeName: locName,
    currency,
    tz,
    totals: reportTotals,
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
    xml,
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

  const d = await buildDayReportData(closer.location_id);
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
export async function closeDayFor(closer: {
  id: string;
  name: string;
  location_id: string;
}): Promise<ActionResult> {
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

  const d = await buildDayReportData(closer.location_id);

  // Refuse to close with nobody to report to — otherwise the day is marked
  // closed and the report is unsendable forever (no resend path exists).
  if (d.recipients.length === 0) {
    return {
      ok: false,
      error: "No report recipients configured — set up an admin email first.",
    };
  }

  const { error: upErr } = await service.from("store_day_closes").upsert(
    {
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
    },
    { onConflict: "location_id,business_date" },
  );
  if (upErr) return { ok: false, error: upErr.message };

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
  const attachments = [
    { filename: `daily-report-${d.bd}.csv`, content: d.csv },
    { filename: `daily-report-${d.bd}.xml`, content: d.xml },
    { filename: `daily-report-${d.bd}.pdf`, content: pdf.toString("base64") },
  ];

  for (const to of d.recipients) {
    await sendSafe({
      to,
      subject: d.subject,
      react: DayReportEmail({
        locationName: d.locName,
        businessDate: `${weekdayName(d.bd)} · ${shortDate(d.bd)}`,
        closedByName: closer.name,
        attended: d.t.attended,
        sold: d.t.sold,
        contacts: d.t.contacts,
        conversionPct: formatPct(d.t.conversion),
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
  }

  return { ok: true };
}
