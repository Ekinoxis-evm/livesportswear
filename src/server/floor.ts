"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEmployee } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { generateMagicToken } from "@/lib/magic-token";
import type { TablesUpdate } from "@/types/db";
import type { ActionResult } from "@/server/shared";

type Service = ReturnType<typeof createServiceClient>;

/** Ids of employees currently on the floor (today, not left), minus `except`. */
async function activeOthers(
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

const uuid = z.string().uuid();
const resultSchema = z.object({ sold: z.boolean(), got_contact: z.boolean() });

const isLead = (role: string) => role === "shift_lead" || role === "store_manager";

const NOT_ALLOWED = {
  ok: false as const,
  error: "Only a shift lead can manage other employees on the floor.",
};

/** Shared context: the signed-in employee, a service client, tz and today. */
async function floorCtx() {
  const { employee } = await requireEmployee();
  const service = createServiceClient();
  const { data: loc } = await service
    .from("locations")
    .select("timezone")
    .eq("id", employee.location_id)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  return { employee, service, bd: businessDate(tz) };
}

/** Open the store day for the rotation queue. Shift leads only. */
export async function openDay(): Promise<ActionResult> {
  const { employee, service, bd } = await floorCtx();
  if (!isLead(employee.role)) {
    return { ok: false, error: "Only a shift lead can open the day." };
  }
  const { error } = await service.from("floor_days").upsert(
    { location_id: employee.location_id, business_date: bd, opened_by: employee.id },
    { onConflict: "location_id,business_date" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal/today");
  return { ok: true };
}

/** Check an employee onto the floor (records their arrival time, back of line). */
export async function checkIn(employeeId: string): Promise<ActionResult> {
  const { employee, service, bd } = await floorCtx();
  if (!uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid employee." };
  }
  // Self check-in is fine; checking in a coworker requires a lead.
  if (employeeId !== employee.id && !isLead(employee.role)) return NOT_ALLOWED;
  const { data: target } = await service
    .from("employees")
    .select("id, location_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!target || target.location_id !== employee.location_id) {
    return { ok: false, error: "That employee isn't at this store." };
  }
  // First arrival opens the store day — reps aren't leads, and waiting for a
  // lead to press "Open day" left the queue invisible after check-in.
  const opened = await service.from("floor_days").upsert(
    { location_id: employee.location_id, business_date: bd, opened_by: employee.id },
    { onConflict: "location_id,business_date", ignoreDuplicates: true },
  );
  if (opened.error) return { ok: false, error: opened.error.message };

  // Entry attestation: a lead adding a coworker counts as the validation (the
  // lead is present); the first person of the day self-validates flagged;
  // anyone else stays pending until a coworker scans their QR.
  const byLead = employeeId !== employee.id;
  const others = await activeOthers(service, employee.location_id, bd, employeeId);
  const now = new Date().toISOString();
  const entry = byLead
    ? { entry_validated_at: now, entry_validated_by: employee.id, entry_self: false }
    : others === 0
      ? { entry_validated_at: now, entry_validated_by: null, entry_self: true }
      : { entry_validated_at: null, entry_validated_by: null, entry_self: false };

  // rotation_count omitted so a returning employee keeps their place in line.
  const { error } = await service.from("floor_checkins").upsert(
    {
      location_id: employee.location_id,
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

  const cid = await checkinId(service, employee.location_id, bd, employeeId);
  if (cid) {
    await clearValidationToken(service, cid, "exit");
    if (entry.entry_validated_at) {
      await clearValidationToken(service, cid, "entry");
    } else {
      const tokenErr = await issueValidationToken(service, cid, "entry");
      if (tokenErr) return { ok: false, error: tokenErr };
    }
  }
  revalidatePath("/portal/today");
  return { ok: true };
}

async function updateCheckin(
  employeeId: string,
  patch: TablesUpdate<"floor_checkins">,
): Promise<ActionResult> {
  const { employee, service, bd } = await floorCtx();
  if (!uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid employee." };
  }
  if (employeeId !== employee.id && !isLead(employee.role)) return NOT_ALLOWED;
  const { error } = await service
    .from("floor_checkins")
    .update(patch)
    .eq("location_id", employee.location_id)
    .eq("business_date", bd)
    .eq("employee_id", employeeId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal/today");
  return { ok: true };
}

/** Mark an employee as attending a customer (out of the rotation for now). */
export async function markAttending(employeeId: string): Promise<ActionResult> {
  return updateCheckin(employeeId, { status: "attending", bumped_at: null });
}

/** Move an employee to the front of the line (manual reorder). Leads only. */
export async function makeUpNext(employeeId: string): Promise<ActionResult> {
  const { employee } = await requireEmployee();
  if (!isLead(employee.role)) return NOT_ALLOWED;
  return updateCheckin(employeeId, { bumped_at: new Date().toISOString() });
}

/** Cancel an attending state without recording a customer. */
export async function setAvailable(employeeId: string): Promise<ActionResult> {
  return updateCheckin(employeeId, { status: "available" });
}

/**
 * Take an employee off the floor (shift ended). Exit attestation mirrors entry:
 * a lead checking out a coworker validates it; the last person leaving
 * self-validates flagged; otherwise the exit stays pending behind a QR.
 */
export async function checkOut(employeeId: string): Promise<ActionResult> {
  const { employee, service, bd } = await floorCtx();
  if (!uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid employee." };
  }
  if (employeeId !== employee.id && !isLead(employee.role)) return NOT_ALLOWED;

  const byLead = employeeId !== employee.id;
  const others = await activeOthers(service, employee.location_id, bd, employeeId);
  const now = new Date().toISOString();
  const exit = byLead
    ? { exit_validated_at: now, exit_validated_by: employee.id, exit_self: false }
    : others === 0
      ? { exit_validated_at: now, exit_validated_by: null, exit_self: true }
      : { exit_validated_at: null, exit_validated_by: null, exit_self: false };

  const { error } = await service
    .from("floor_checkins")
    .update({ left_at: now, status: "available", ...exit })
    .eq("location_id", employee.location_id)
    .eq("business_date", bd)
    .eq("employee_id", employeeId);
  if (error) return { ok: false, error: error.message };

  const cid = await checkinId(service, employee.location_id, bd, employeeId);
  if (cid) {
    if (exit.exit_validated_at) {
      await clearValidationToken(service, cid, "exit");
    } else {
      const tokenErr = await issueValidationToken(service, cid, "exit");
      if (tokenErr) return { ok: false, error: tokenErr };
    }
  }
  revalidatePath("/portal/today");
  return { ok: true };
}

const tokenSchema = z.string().min(20).max(128);

/**
 * A coworker confirms an entry/exit by opening the QR link. Guards: the
 * validator must be an active check-in at the same store today and can't
 * attest their own stamp. Failures are generic (no token enumeration).
 */
export async function validateAttendance(token: string): Promise<ActionResult> {
  const { employee, service, bd } = await floorCtx();
  const INVALID = { ok: false as const, error: "This validation link is no longer valid." };
  if (!tokenSchema.safeParse(token).success) return INVALID;

  const { data: val } = await service
    .from("attendance_validations")
    .select(
      "id, kind, checkin_id, used_at, floor_checkins!inner(employee_id, location_id, business_date)",
    )
    .eq("token", token)
    .maybeSingle();
  const checkin = val?.floor_checkins as
    | { employee_id: string; location_id: string; business_date: string }
    | undefined;
  if (!val || val.used_at || !checkin) return INVALID;
  if (checkin.location_id !== employee.location_id || checkin.business_date !== bd) {
    return INVALID;
  }
  if (checkin.employee_id === employee.id) {
    return { ok: false, error: "You can't validate your own entry or exit." };
  }
  const { data: me } = await service
    .from("floor_checkins")
    .select("id")
    .eq("location_id", employee.location_id)
    .eq("business_date", bd)
    .eq("employee_id", employee.id)
    .is("left_at", null)
    .maybeSingle();
  if (!me) {
    return { ok: false, error: "Check in at the store before validating a coworker." };
  }

  const now = new Date().toISOString();
  const stamp =
    val.kind === "entry"
      ? { entry_validated_at: now, entry_validated_by: employee.id, entry_self: false }
      : { exit_validated_at: now, exit_validated_by: employee.id, exit_self: false };
  const upd = await service.from("floor_checkins").update(stamp).eq("id", val.checkin_id);
  if (upd.error) return { ok: false, error: upd.error.message };
  const mark = await service
    .from("attendance_validations")
    .update({ used_at: now, validated_by: employee.id })
    .eq("id", val.id)
    .is("used_at", null);
  if (mark.error) return { ok: false, error: mark.error.message };

  revalidatePath("/portal/today");
  return { ok: true };
}

/**
 * Finish the current customer: record the conversion (sold / got-contact) at the
 * time it happened, then send the employee to the back of the line.
 */
export async function finishCustomer(
  employeeId: string,
  input: z.input<typeof resultSchema>,
): Promise<ActionResult> {
  const { employee, service, bd } = await floorCtx();
  if (!uuid.safeParse(employeeId).success) {
    return { ok: false, error: "Invalid employee." };
  }
  // Employees record their own result; a lead may record for a coworker.
  if (employeeId !== employee.id && !isLead(employee.role)) return NOT_ALLOWED;
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const ins = await service.from("client_events").insert({
    location_id: employee.location_id,
    employee_id: employeeId,
    business_date: bd,
    sold: parsed.data.sold,
    got_contact: parsed.data.got_contact,
  });
  if (ins.error) return { ok: false, error: ins.error.message };

  const { data: cur } = await service
    .from("floor_checkins")
    .select("rotation_count")
    .eq("location_id", employee.location_id)
    .eq("business_date", bd)
    .eq("employee_id", employeeId)
    .maybeSingle();
  const { error } = await service
    .from("floor_checkins")
    .update({
      status: "available",
      rotation_count: (cur?.rotation_count ?? 0) + 1,
      bumped_at: null,
    })
    .eq("location_id", employee.location_id)
    .eq("business_date", bd)
    .eq("employee_id", employeeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/today");
  return { ok: true };
}
