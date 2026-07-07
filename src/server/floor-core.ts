import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { TablesUpdate } from "@/types/db";
import type { ActionResult } from "@/server/shared";

/**
 * Bodies for the floor-queue writes, driven exclusively by the store kiosk
 * (src/server/store-floor.ts) — the shared iPad at the counter is the one
 * surface managing check-ins and the turn order. Entry/exit stamps are
 * recorded validated: the device standing in the store plus the employee's
 * PIN is the attestation. The queue math lives in src/lib/floor-queue.ts.
 */

export type Service = ReturnType<typeof createServiceClient>;

export async function doOpenDay(
  service: Service,
  locationId: string,
  bd: string,
  openedBy: string | null,
  ignoreDuplicates = false,
): Promise<ActionResult> {
  const { error } = await service.from("floor_days").upsert(
    { location_id: locationId, business_date: bd, opened_by: openedBy },
    { onConflict: "location_id,business_date", ignoreDuplicates },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Check an employee onto the floor (arrival recorded, back of the line). */
export async function doCheckIn(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  now: string,
): Promise<ActionResult> {
  // First arrival opens the store day.
  const opened = await doOpenDay(service, locationId, bd, employeeId, true);
  if (!opened.ok) return opened;

  // rotation_count omitted so a returning employee keeps their place in line.
  const { error } = await service.from("floor_checkins").upsert(
    {
      location_id: locationId,
      business_date: bd,
      employee_id: employeeId,
      arrived_at: now,
      left_at: null,
      status: "available",
      bumped_at: null,
      entry_validated_at: now,
      entry_validated_by: null,
      entry_self: false,
      exit_validated_at: null,
      exit_validated_by: null,
      exit_self: false,
    },
    { onConflict: "location_id,business_date,employee_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Take an employee off the floor (shift ended). */
export async function doCheckOut(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  now: string,
): Promise<ActionResult> {
  const { error } = await service
    .from("floor_checkins")
    .update({
      left_at: now,
      status: "available",
      exit_validated_at: now,
      exit_validated_by: null,
      exit_self: false,
    })
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", employeeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function patchCheckin(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  patch: TablesUpdate<"floor_checkins">,
): Promise<ActionResult> {
  const { error } = await service
    .from("floor_checkins")
    .update(patch)
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", employeeId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Finish the current customer: record the conversion (sold / got-contact) at
 * the time it happened, then send the employee to the back of the line.
 */
export async function doFinishCustomer(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  result: { sold: boolean; got_contact: boolean },
): Promise<ActionResult> {
  const ins = await service.from("client_events").insert({
    location_id: locationId,
    employee_id: employeeId,
    business_date: bd,
    sold: result.sold,
    got_contact: result.got_contact,
  });
  if (ins.error) return { ok: false, error: ins.error.message };

  const { data: cur } = await service
    .from("floor_checkins")
    .select("rotation_count")
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", employeeId)
    .maybeSingle();
  return patchCheckin(service, locationId, bd, employeeId, {
    status: "available",
    rotation_count: (cur?.rotation_count ?? 0) + 1,
    bumped_at: null,
  });
}
