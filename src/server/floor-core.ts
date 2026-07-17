import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  afterClose,
  afterTake,
  canClose,
  openOfKind,
  rotationAfterFinish,
  statusAfter,
  type FloorStatus,
} from "@/lib/floor-state";
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
  photoPath: string | null = null,
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
      manual_pos: null,
      attending_count: 0,
      attending_return_count: 0,
      entry_validated_at: now,
      entry_validated_by: null,
      entry_self: false,
      entry_photo_path: photoPath,
      exit_validated_at: null,
      exit_validated_by: null,
      exit_self: false,
      exit_missed: false,
      exit_photo_path: null,
    },
    { onConflict: "location_id,business_date,employee_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Take an employee off the floor (shift ended). Auto-ends an open break.
 * Refuses while they hold open customers — a payroll stamp must not silently
 * drop a client; the rep is at the kiosk and can finish, undo, or clear.
 * (The stale-checkin cron closes forgotten rows with its own update.)
 */
export async function doCheckOut(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  now: string,
  photoPath: string | null = null,
): Promise<ActionResult> {
  const cur = await readCounts(service, locationId, bd, employeeId);
  const open =
    openOfKind(cur, cur.status, "walkin") + openOfKind(cur, cur.status, "return");
  if (open > 0) {
    return {
      ok: false,
      error: "They're with a client — finish or undo it first.",
    };
  }

  const { error } = await service
    .from("floor_checkins")
    .update({
      left_at: now,
      status: "available",
      exit_validated_at: now,
      exit_validated_by: null,
      exit_self: false,
      exit_photo_path: photoPath,
    })
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", employeeId);
  if (error) return { ok: false, error: error.message };

  // Leaving the floor ends the break too; zero rows matched is fine.
  await doEndBreak(service, locationId, bd, employeeId, now);
  return { ok: true };
}

/** Start a break — the partial unique index makes a double tap a clean error. */
export async function doStartBreak(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  now: string,
): Promise<ActionResult> {
  const { error } = await service.from("floor_breaks").insert({
    location_id: locationId,
    business_date: bd,
    employee_id: employeeId,
    started_at: now,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Already on a break." };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** End the open break at `at`. Zero matched rows means there wasn't one. */
export async function doEndBreak(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  at: string,
): Promise<ActionResult> {
  const { data, error } = await service
    .from("floor_breaks")
    .update({ ended_at: at })
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", employeeId)
    .is("ended_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Not on a break." };
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

async function readCounts(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
) {
  const { data } = await service
    .from("floor_checkins")
    .select("rotation_count, attending_count, attending_return_count, status")
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", employeeId)
    .maybeSingle();
  return {
    rotation: data?.rotation_count ?? 0,
    walkins: data?.attending_count ?? 0,
    returns: data?.attending_return_count ?? 0,
    status: (data?.status ?? "available") as FloorStatus,
  };
}

/**
 * Take one customer (walk-in or return). Increments the open-client counter —
 * an employee alone in the store can hold several at once. Taking a customer
 * removes them from the line, so bump and manual position are cleared.
 * Read-then-write is fine here: the kiosk is the floor's single writer.
 */
export async function doTakeClient(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  kind: "walkin" | "return",
): Promise<ActionResult> {
  const cur = await readCounts(service, locationId, bd, employeeId);
  const next = afterTake(cur, kind);
  return patchCheckin(service, locationId, bd, employeeId, {
    status: statusAfter(next),
    attending_count: next.walkins,
    attending_return_count: next.returns,
    bumped_at: null,
    manual_pos: null,
  });
}

/**
 * Undo a mistaken take: close ONE open customer of `kind` as if it never
 * happened — no client_events row, no rotation_count change. The bump/manual
 * position the take cleared can't be restored (not persisted anywhere); the
 * member re-enters the line at plain rotation order.
 */
export async function doUndoTake(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  kind: "walkin" | "return",
): Promise<ActionResult> {
  const cur = await readCounts(service, locationId, bd, employeeId);
  if (!canClose(cur, cur.status, kind)) {
    return { ok: false, error: "No open client to undo." };
  }
  const next = afterClose(cur, kind);
  return patchCheckin(service, locationId, bd, employeeId, {
    status: statusAfter(next),
    attending_count: next.walkins,
    attending_return_count: next.returns,
  });
}

/**
 * Drop all open customers without recording anything ("back to line").
 * Bump and manual position are cleared too — re-entering the line with a
 * leftover bump would jump the queue without having served anyone.
 */
export async function doClearAttending(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
): Promise<ActionResult> {
  return patchCheckin(service, locationId, bd, employeeId, {
    status: "available",
    attending_count: 0,
    attending_return_count: 0,
    bumped_at: null,
    manual_pos: null,
  });
}

export type FinishResult = {
  kind: "walkin" | "return";
  sold: boolean; // for a return: the customer bought something else
  got_contact: boolean;
  reasons?: string[]; // mandatory (app layer) when a walk-in didn't buy
  products?: { id: string; title: string; sku?: string | null }[];
  note?: string;
};

/**
 * Finish ONE open customer: record the event at the time it happened, then
 * decrement that counter — the employee stays attending until every open
 * customer is closed. A finished walk-in bumps rotation_count (back of the
 * line); a return does NOT burn a turn (the taker is usually the last in
 * line, not the up-next).
 */
export async function doFinishCustomer(
  service: Service,
  locationId: string,
  bd: string,
  employeeId: string,
  result: FinishResult,
): Promise<ActionResult> {
  // Guard before the event insert — a finish with nothing open must not
  // record a phantom customer or burn a rotation turn.
  const cur = await readCounts(service, locationId, bd, employeeId);
  if (!canClose(cur, cur.status, result.kind)) {
    return { ok: false, error: "No open client to finish." };
  }

  const ins = await service.from("client_events").insert({
    location_id: locationId,
    employee_id: employeeId,
    business_date: bd,
    kind: result.kind,
    sold: result.sold,
    got_contact: result.got_contact,
    reasons: result.reasons ?? null,
    products: result.products ?? null,
    note: result.note ?? null,
  });
  if (ins.error) return { ok: false, error: ins.error.message };

  const next = afterClose(cur, result.kind);
  return patchCheckin(service, locationId, bd, employeeId, {
    status: statusAfter(next),
    attending_count: next.walkins,
    attending_return_count: next.returns,
    rotation_count: rotationAfterFinish(cur.rotation, result.kind),
    bumped_at: null,
  });
}
