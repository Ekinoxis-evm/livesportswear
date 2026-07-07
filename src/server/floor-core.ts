import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { generateMagicToken } from "@/lib/magic-token";
import type { TablesUpdate } from "@/types/db";
import type { ActionResult } from "@/server/shared";

/**
 * Shared bodies for the floor queue actions. Two callers with different
 * identities use them: the employee portal (src/server/floor.ts — self/lead
 * permission checks) and the store kiosk (src/server/store-floor.ts — the
 * trusted device acting for any employee at its location). The queue math
 * itself lives in src/lib/floor-queue.ts and is untouched.
 */

export type Service = ReturnType<typeof createServiceClient>;

export type EntryStamp = {
  entry_validated_at: string | null;
  entry_validated_by: string | null;
  entry_self: boolean;
};

export type ExitStamp = {
  exit_validated_at: string | null;
  exit_validated_by: string | null;
  exit_self: boolean;
};

/** Ids of employees currently on the floor (today, not left), minus `except`. */
export async function activeOthers(
  service: Service,
  locationId: string,
  bd: string,
  except: string,
): Promise<number> {
  const { count } = await service
    .from("floor_checkins")
    .select("id", { count: "exact", head: true })
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .is("left_at", null)
    .neq("employee_id", except);
  return count ?? 0;
}

async function checkinId(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
): Promise<string | null> {
  const { data } = await service
    .from("floor_checkins")
    .select("id")
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", employeeId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Issue (or rotate) the one-time QR token for a pending entry/exit attestation. */
async function issueValidationToken(
  service: Service,
  checkin: string,
  kind: "entry" | "exit",
): Promise<string | null> {
  const { error } = await service.from("attendance_validations").upsert(
    {
      checkin_id: checkin,
      kind,
      token: generateMagicToken(),
      used_at: null,
      validated_by: null,
    },
    { onConflict: "checkin_id,kind" },
  );
  return error ? error.message : null;
}

async function clearValidationToken(
  service: Service,
  checkin: string,
  kind: "entry" | "exit",
): Promise<void> {
  await service
    .from("attendance_validations")
    .delete()
    .eq("checkin_id", checkin)
    .eq("kind", kind);
}

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

/** Check an employee onto the floor with a precomputed entry attestation. */
export async function doCheckIn(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  now: string,
  entry: EntryStamp,
): Promise<ActionResult> {
  // First arrival opens the store day — waiting for someone with permission to
  // press "Open day" left the queue invisible after check-in.
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
      ...entry,
      exit_validated_at: null,
      exit_validated_by: null,
      exit_self: false,
    },
    { onConflict: "location_id,business_date,employee_id" },
  );
  if (error) return { ok: false, error: error.message };

  const cid = await checkinId(service, locationId, bd, employeeId);
  if (cid) {
    await clearValidationToken(service, cid, "exit");
    if (entry.entry_validated_at) {
      await clearValidationToken(service, cid, "entry");
    } else {
      const tokenErr = await issueValidationToken(service, cid, "entry");
      if (tokenErr) return { ok: false, error: tokenErr };
    }
  }
  return { ok: true };
}

/** Take an employee off the floor with a precomputed exit attestation. */
export async function doCheckOut(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  now: string,
  exit: ExitStamp,
): Promise<ActionResult> {
  const { error } = await service
    .from("floor_checkins")
    .update({ left_at: now, status: "available", ...exit })
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", employeeId);
  if (error) return { ok: false, error: error.message };

  const cid = await checkinId(service, locationId, bd, employeeId);
  if (cid) {
    if (exit.exit_validated_at) {
      await clearValidationToken(service, cid, "exit");
    } else {
      const tokenErr = await issueValidationToken(service, cid, "exit");
      if (tokenErr) return { ok: false, error: tokenErr };
    }
  }
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
