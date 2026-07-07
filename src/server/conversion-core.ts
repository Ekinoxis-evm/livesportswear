import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSafe } from "@/lib/resend";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson, formatPct } from "@/lib/conversion";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { fetchDaySales } from "@/lib/shopify";
import { dayRangeInTz } from "@/lib/shopify-range";
import { formatMoney } from "@/lib/commission";
import { weekdayName } from "@/lib/weekdays";
import { shortDate } from "@/lib/format-date";
import { DayReportEmail, type DayReportRow } from "@/lib/emails/day-report";
import type { ActionResult } from "@/server/shared";

/** Emails of admins who should receive a location's daily report. */
async function reportRecipients(): Promise<string[]> {
  const service = createServiceClient();
  const { data } = await service.auth.admin.listUsers();
  const users = data?.users ?? [];
  const recipients = users.filter((u) => {
    const meta = u.app_metadata as { role?: string; admin_scope?: string } | undefined;
    if (meta?.role !== "admin") return false;
    return true; // location scoping is refined in Phase F via admin_locations
  });
  const emails = recipients.map((u) => u.email).filter((e): e is string => Boolean(e));
  const fallback = process.env.STORE_REPORT_EMAIL;
  return emails.length ? emails : fallback ? [fallback] : [];
}

/**
 * Close the store day as `closer`: same eligibility rule regardless of the
 * caller (portal button or store kiosk) — the closer must be on today's
 * published schedule AND checked in on the floor. Snapshots conversion (and
 * the day's Shopify sales) into store_day_closes and emails the daily report.
 * Idempotent on (location, business_date).
 */
export async function closeDayFor(closer: {
  id: string;
  name: string;
  location_id: string;
}): Promise<ActionResult> {
  const service = createServiceClient();

  const { data: loc } = await service
    .from("locations")
    .select("name, timezone")
    .eq("id", closer.location_id)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  const locName = loc?.name ?? "Store";
  const bd = businessDate(tz);

  // Only someone on today's published schedule who is checked in on the floor
  // may close the day (usually the evening shift).
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
  if (!closerShift) {
    return { ok: false, error: "Only someone with a shift today can close the day." };
  }
  if (!closerCheckin) {
    return { ok: false, error: "Mark your entry before closing the day." };
  }

  const { data: rows } = await service
    .from("client_events")
    .select("employee_id, sold, got_contact, employees(name)")
    .eq("location_id", closer.location_id)
    .eq("business_date", bd);
  const events = rows ?? [];

  const t = totals(events);
  const nameOf = new Map<string, string>();
  for (const e of events) {
    const n = (e.employees as { name: string } | null)?.name;
    if (n) nameOf.set(e.employee_id, n);
  }
  const perPerson: DayReportRow[] = byPerson(events).map((p) => ({
    name: nameOf.get(p.employeeId) ?? "Unknown",
    attended: p.attended,
    sold: p.sold,
    conversionPct: formatPct(p.conversion),
  }));

  // The day's Shopify money line, captured at close. Shopify being down must
  // never block closing the day.
  let shopifySales: number | null = null;
  let currency: string | null = null;
  if (isShopifyConfigured()) {
    try {
      const range = dayRangeInTz(bd, tz);
      const day = await fetchDaySales(range.start, range.endExclusive);
      shopifySales = day.total;
      currency = day.currency;
    } catch {
      // report email simply omits the money line
    }
  }

  const { error: upErr } = await service.from("store_day_closes").upsert(
    {
      location_id: closer.location_id,
      business_date: bd,
      closed_by: closer.id,
      attended_count: t.attended,
      sold_count: t.sold,
      contact_count: t.contacts,
      shopify_sales: shopifySales,
      currency,
    },
    { onConflict: "location_id,business_date" },
  );
  if (upErr) return { ok: false, error: upErr.message };

  const recipients = await reportRecipients();
  for (const to of recipients) {
    await sendSafe({
      to,
      subject: `Daily report — ${locName} · ${weekdayName(bd)} ${shortDate(bd)}`,
      react: DayReportEmail({
        locationName: locName,
        businessDate: `${weekdayName(bd)} · ${shortDate(bd)}`,
        closedByName: closer.name,
        attended: t.attended,
        sold: t.sold,
        contacts: t.contacts,
        conversionPct: formatPct(t.conversion),
        shopifySales:
          shopifySales != null
            ? formatMoney(shopifySales, currency ?? "USD")
            : null,
        perPerson,
      }),
    });
  }

  return { ok: true };
}
