"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { hashPin, PIN_RE } from "@/lib/kiosk-pin";
import {
  doOpenDay,
  doCheckIn,
  doCheckOut,
  patchCheckin,
  doFinishCustomer,
} from "@/server/floor-core";
import {
  closeDayFor,
  closeDayDraftFor,
  type CloseDayDraft,
} from "@/server/conversion-core";
import type { ActionResult } from "@/server/shared";

const uuid = z.string().uuid();
const resultSchema = z.object({ sold: z.boolean(), got_contact: z.boolean() });

type StoreEmployee = {
  id: string;
  name: string;
  location_id: string;
  kiosk_pin_hash: string | null;
};

/**
 * Shared context for kiosk actions: the store account's location (from the
 * JWT claim), a service client, and the store-local business date. The kiosk
 * is the trusted floor device — it may act for any employee AT ITS LOCATION.
 */
async function storeCtx() {
  const { locationId } = await requireStore();
  const service = createServiceClient();
  const { data: loc } = await service
    .from("locations")
    .select("timezone")
    .eq("id", locationId)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  return { locationId, service, bd: businessDate(tz) };
}

async function targetEmployee(
  service: ReturnType<typeof createServiceClient>,
  locationId: string,
  employeeId: string,
): Promise<StoreEmployee | null> {
  if (!uuid.safeParse(employeeId).success) return null;
  const { data } = await service
    .from("employees")
    .select("id, name, location_id, kiosk_pin_hash")
    .eq("id", employeeId)
    .eq("active", true)
    .maybeSingle();
  if (!data || data.location_id !== locationId) return null;
  return data as StoreEmployee;
}

/** PIN gate for entry/exit — hours are money; a tap must prove who tapped. */
function pinError(emp: StoreEmployee, pin: string): string | null {
  if (!emp.kiosk_pin_hash) {
    return "No PIN set yet — set it in the portal (Settings) or ask the admin.";
  }
  if (!PIN_RE.test(pin) || hashPin(pin, emp.id) !== emp.kiosk_pin_hash) {
    return "Wrong PIN.";
  }
  return null;
}

/** Open the store day from the kiosk (the trusted device needs no lead). */
export async function storeOpenDay(): Promise<ActionResult> {
  const { locationId, service, bd } = await storeCtx();
  const res = await doOpenDay(service, locationId, bd, null);
  if (res.ok) revalidatePath("/store", "layout");
  return res;
}

const MAX_PHOTO_BYTES = 200 * 1024; // client targets ~25KB; this is the hard ceiling

/**
 * Face-photo evidence for a stamp. Upload failure returns null instead of an
 * error: the photo is evidence, not a gate, and its absence is itself visible
 * in the day's records.
 */
async function uploadStampPhoto(
  service: ReturnType<typeof createServiceClient>,
  formData: FormData,
  locationId: string,
  bd: string,
  employeeId: string,
  kind: "entry" | "exit",
): Promise<string | null> {
  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return null;
  if (photo.type !== "image/jpeg" || photo.size > MAX_PHOTO_BYTES) return null;

  const path = `${locationId}/${bd}/${employeeId}-${kind}.jpg`;
  const upload = await service.storage
    .from("checkin-photos")
    .upload(path, await photo.arrayBuffer(), {
      contentType: "image/jpeg",
      upsert: true,
    });
  return upload.error ? null : path;
}

const stampSchema = z.object({
  employeeId: z.string().uuid(),
  pin: z.string().regex(PIN_RE),
});

function parseStampForm(formData: FormData) {
  return stampSchema.safeParse({
    employeeId: formData.get("employeeId"),
    pin: formData.get("pin"),
  });
}

/**
 * Kiosk check-in: PIN-confirmed, and the stamp counts as validated — the
 * device standing in the store is the attestation, so no QR is issued.
 * The optional face photo is stored as evidence (30-day retention).
 */
export async function storeCheckIn(formData: FormData): Promise<ActionResult> {
  const parsed = parseStampForm(formData);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, parsed.data.employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  const bad = pinError(emp, parsed.data.pin);
  if (bad) return { ok: false, error: bad };

  const photoPath = await uploadStampPhoto(service, formData, locationId, bd, emp.id, "entry");
  const now = new Date().toISOString();
  const res = await doCheckIn(service, locationId, bd, emp.id, now, photoPath);
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

/** Kiosk check-out: PIN-confirmed, stamp validated (see storeCheckIn). */
export async function storeCheckOut(formData: FormData): Promise<ActionResult> {
  const parsed = parseStampForm(formData);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, parsed.data.employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  const bad = pinError(emp, parsed.data.pin);
  if (bad) return { ok: false, error: bad };

  const photoPath = await uploadStampPhoto(service, formData, locationId, bd, emp.id, "exit");
  const now = new Date().toISOString();
  const res = await doCheckOut(service, locationId, bd, emp.id, now, photoPath);
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

async function storePatch(
  employeeId: string,
  patch: Parameters<typeof patchCheckin>[4],
): Promise<ActionResult> {
  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  const res = await patchCheckin(service, locationId, bd, emp.id, patch);
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

/** The up-next employee takes the walk-in (one tap, no PIN — floor speed). */
export async function storeTakeClient(employeeId: string): Promise<ActionResult> {
  return storePatch(employeeId, { status: "attending", bumped_at: null });
}

/** Cancel an attending state without recording a customer. */
export async function storeSetAvailable(employeeId: string): Promise<ActionResult> {
  return storePatch(employeeId, { status: "available" });
}

/** Move an employee to the front of the line (manual reorder). */
export async function storeMakeUpNext(employeeId: string): Promise<ActionResult> {
  return storePatch(employeeId, { bumped_at: new Date().toISOString() });
}

/** Record the customer result and rotate the employee to the back of the line. */
export async function storeFinish(
  employeeId: string,
  input: z.input<typeof resultSchema>,
): Promise<ActionResult> {
  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  const parsed = resultSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const res = await doFinishCustomer(service, locationId, bd, emp.id, parsed.data);
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

/**
 * Preview the daily report before sending: metrics, recipients, subject, and
 * attachment row counts — exactly what the confirmed close will send.
 */
export async function storeCloseDayDraft(
  closedById: string,
): Promise<ActionResult<CloseDayDraft>> {
  const { locationId, service } = await storeCtx();
  const emp = await targetEmployee(service, locationId, closedById);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  return closeDayDraftFor({ id: emp.id, location_id: locationId });
}

/**
 * Close the day from the kiosk — the selected closer must be on today's
 * published schedule and checked in (the rule predates the kiosk).
 */
export async function storeCloseDay(closedById: string): Promise<ActionResult> {
  const { locationId, service } = await storeCtx();
  const emp = await targetEmployee(service, locationId, closedById);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };

  const res = await closeDayFor({
    id: emp.id,
    name: emp.name,
    location_id: locationId,
  });
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}
