"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSafe } from "@/lib/resend";
import { businessDate } from "@/lib/business-date";
import { totals, byPerson, formatPct } from "@/lib/conversion";
import { DayReportEmail, type DayReportRow } from "@/lib/emails/day-report";
import type { ActionResult } from "@/server/shared";

const markSchema = z.object({ sold: z.boolean(), got_contact: z.boolean() });

async function locationTimezone(locationId: string): Promise<string> {
  const service = createServiceClient();
  const { data } = await service
    .from("locations")
    .select("timezone")
    .eq("id", locationId)
    .maybeSingle();
  return data?.timezone ?? "UTC";
}

/** Record one attended customer (sold / got-contact) for the signed-in rep. */
export async function markClient(
  input: z.input<typeof markSchema>,
): Promise<ActionResult> {
  const { employee } = await requireEmployee();
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const tz = await locationTimezone(employee.location_id);
  // Server (RLS) client: the self-insert policy checks current_employee_id()
  // and current_location_id(), so a rep can only write their own events.
  const supabase = await createServerClient();
  const { error } = await supabase.from("client_events").insert({
    location_id: employee.location_id,
    employee_id: employee.id,
    business_date: businessDate(tz),
    sold: parsed.data.sold,
    got_contact: parsed.data.got_contact,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/today");
  return { ok: true };
}

/** Undo the rep's most recent client today (mis-swipe correction). */
export async function undoLastClient(): Promise<ActionResult> {
  const { employee } = await requireEmployee();
  const tz = await locationTimezone(employee.location_id);
  const bd = businessDate(tz);

  // Service client: scoped to delete only the caller's own latest same-day row.
  const service = createServiceClient();
  const { data: last } = await service
    .from("client_events")
    .select("id")
    .eq("employee_id", employee.id)
    .eq("business_date", bd)
    .order("attended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { ok: false, error: "Nothing to undo." };

  const { error } = await service.from("client_events").delete().eq("id", last.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/today");
  return { ok: true };
}

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
 * Close the store day: snapshot the location's conversion into store_day_closes
 * and email the daily report to admins. Idempotent on (location, business_date).
 * shopify_sales is left null until POS keys are connected (then backfilled).
 */
export async function closeDay(): Promise<ActionResult> {
  const { employee } = await requireEmployee();
  const service = createServiceClient();

  const { data: loc } = await service
    .from("locations")
    .select("name, timezone")
    .eq("id", employee.location_id)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  const locName = loc?.name ?? "Store";
  const bd = businessDate(tz);

  const { data: rows } = await service
    .from("client_events")
    .select("employee_id, sold, got_contact, employees(name)")
    .eq("location_id", employee.location_id)
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

  const { error: upErr } = await service.from("store_day_closes").upsert(
    {
      location_id: employee.location_id,
      business_date: bd,
      closed_by: employee.id,
      attended_count: t.attended,
      sold_count: t.sold,
      contact_count: t.contacts,
    },
    { onConflict: "location_id,business_date" },
  );
  if (upErr) return { ok: false, error: upErr.message };

  const recipients = await reportRecipients();
  for (const to of recipients) {
    await sendSafe({
      to,
      subject: `Daily report — ${locName} ${bd}`,
      react: DayReportEmail({
        locationName: locName,
        businessDate: bd,
        closedByName: employee.name,
        attended: t.attended,
        sold: t.sold,
        contacts: t.contacts,
        conversionPct: formatPct(t.conversion),
        shopifySales: null,
        perPerson,
      }),
    });
  }

  revalidatePath("/portal/today");
  return { ok: true };
}
