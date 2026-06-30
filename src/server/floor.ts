"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEmployee } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import type { TablesUpdate } from "@/types/db";
import type { ActionResult } from "@/server/shared";

const uuid = z.string().uuid();
const resultSchema = z.object({ sold: z.boolean(), got_contact: z.boolean() });

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

/** Open the store day for the rotation queue. */
export async function openDay(): Promise<ActionResult> {
  const { employee, service, bd } = await floorCtx();
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
  const { data: target } = await service
    .from("employees")
    .select("id, location_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (!target || target.location_id !== employee.location_id) {
    return { ok: false, error: "That employee isn't at this store." };
  }
  // rotation_count omitted so a returning employee keeps their place in line.
  const { error } = await service.from("floor_checkins").upsert(
    {
      location_id: employee.location_id,
      business_date: bd,
      employee_id: employeeId,
      arrived_at: new Date().toISOString(),
      left_at: null,
      status: "available",
    },
    { onConflict: "location_id,business_date,employee_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal/today");
  return { ok: true };
}

async function updateCheckin(
  employeeId: string,
  patch: TablesUpdate<"floor_checkins">,
): Promise<ActionResult> {
  const { employee, service, bd } = await floorCtx();
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
  return updateCheckin(employeeId, { status: "attending" });
}

/** Cancel an attending state without recording a customer. */
export async function setAvailable(employeeId: string): Promise<ActionResult> {
  return updateCheckin(employeeId, { status: "available" });
}

/** Take an employee off the floor (e.g. shift ended). */
export async function checkOut(employeeId: string): Promise<ActionResult> {
  return updateCheckin(employeeId, {
    left_at: new Date().toISOString(),
    status: "available",
  });
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
    .update({ status: "available", rotation_count: (cur?.rotation_count ?? 0) + 1 })
    .eq("location_id", employee.location_id)
    .eq("business_date", bd)
    .eq("employee_id", employeeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/today");
  return { ok: true };
}
