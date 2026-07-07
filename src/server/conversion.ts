"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { closeDayFor } from "@/server/conversion-core";
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

/**
 * Close the store day (portal button): the signed-in employee is the closer.
 * Eligibility + snapshot + report email live in closeDayFor (shared with the
 * store kiosk).
 */
export async function closeDay(): Promise<ActionResult> {
  const { employee } = await requireEmployee();
  const res = await closeDayFor({
    id: employee.id,
    name: employee.name,
    location_id: employee.location_id,
  });
  if (res.ok) revalidatePath("/portal/today");
  return res;
}
