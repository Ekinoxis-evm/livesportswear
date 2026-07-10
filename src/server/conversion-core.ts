import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSafe } from "@/lib/resend";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson, formatPct, type ConversionTotals } from "@/lib/conversion";
import { getDaySalesCached } from "@/lib/shopify-day-cache";
import type { DaySales } from "@/lib/shopify";
import { buildDayReportCsv } from "@/lib/day-report-csv";
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
  shopifySales: string | null; // formatted money-in for the day
  shopifyOrders: number | null;
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
  recipients: string[];
  subject: string;
  csv: string;
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

  const [{ data: eventRows }, { data: checkinRows }, shopify, recipients] =
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
      getDaySalesCached(bd, tz),
      reportRecipients(locationId),
    ]);

  const events = eventRows ?? [];
  const checkins = checkinRows ?? [];
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

  const csv = buildDayReportCsv({
    businessDate: bd,
    tz,
    events: events.map((e) => ({
      employeeName: nameOf(e),
      attended_at: e.attended_at,
      kind: e.kind,
      sold: e.sold,
      got_contact: e.got_contact,
      reasons: e.reasons,
      products: (e.products as { title: string }[] | null) ?? null,
      note: e.note,
    })),
    checkins: checkins.map((c) => ({
      employeeName: nameOf(c),
      arrived_at: c.arrived_at,
      left_at: c.left_at,
      entry_validated_at: c.entry_validated_at,
      entry_self: c.entry_self,
      exit_validated_at: c.exit_validated_at,
      exit_self: c.exit_self,
      exit_missed: c.exit_missed,
    })),
  });

  return {
    locName,
    tz,
    bd,
    t,
    perPerson,
    shopify,
    recipients,
    subject: `Daily Report — ${locName} · ${weekdayName(bd)} ${shortDate(bd)}`,
    csv,
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
        d.shopify != null ? formatMoney(d.shopify.total, d.shopify.currency ?? "USD") : null,
      shopifyOrders: d.shopify?.orders ?? null,
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
      shopify_sales: d.shopify?.total ?? null,
      currency: d.shopify?.currency ?? null,
    },
    { onConflict: "location_id,business_date" },
  );
  if (upErr) return { ok: false, error: upErr.message };

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
            ? formatMoney(d.shopify.total, d.shopify.currency ?? "USD")
            : null,
        shopifyOrders: d.shopify?.orders ?? null,
        perPerson: d.perPerson,
      }),
      attachments: [{ filename: `daily-report-${d.bd}.csv`, content: d.csv }],
    });
  }

  return { ok: true };
}
