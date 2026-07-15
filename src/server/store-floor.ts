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
  doTakeClient,
  doUndoTake,
  doClearAttending,
  doFinishCustomer,
  doStartBreak,
  doEndBreak,
} from "@/server/floor-core";
import {
  closeDayFor,
  closeDayDraftFor,
  type CloseDayDraft,
} from "@/server/conversion-core";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { searchProducts, type ProductHit } from "@/lib/shopify";
import { finishSchema, type FinishInput } from "@/lib/finish-schema";
import { firstError, type ActionResult } from "@/server/shared";

const uuid = z.string().uuid();

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

  // A same-day re-check-in resets the row's photo pointers; the previous
  // cycle's files must go too, or retention can never find them (it deletes
  // by the paths still referenced on the row).
  const { data: prev } = await service
    .from("floor_checkins")
    .select("entry_photo_path, exit_photo_path")
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", emp.id)
    .maybeSingle();

  const photoPath = await uploadStampPhoto(service, formData, locationId, bd, emp.id, "entry");
  const now = new Date().toISOString();
  const res = await doCheckIn(service, locationId, bd, emp.id, now, photoPath);
  if (res.ok) {
    const stale = [prev?.entry_photo_path, prev?.exit_photo_path].filter(
      (p): p is string => Boolean(p) && p !== photoPath,
    );
    if (stale.length > 0) {
      await service.storage.from("checkin-photos").remove(stale); // best-effort
    }
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

async function storeTake(
  employeeId: string,
  kind: "walkin" | "return",
): Promise<ActionResult> {
  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };

  // The UI hides Take for off-floor/on-break members, but a stale screen can
  // still submit one — the server is the guard, not the render.
  const [{ data: row }, { data: openBreak }] = await Promise.all([
    service
      .from("floor_checkins")
      .select("left_at")
      .eq("location_id", locationId)
      .eq("business_date", bd)
      .eq("employee_id", emp.id)
      .maybeSingle(),
    service
      .from("floor_breaks")
      .select("id")
      .eq("location_id", locationId)
      .eq("business_date", bd)
      .eq("employee_id", emp.id)
      .is("ended_at", null)
      .maybeSingle(),
  ]);
  if (!row || row.left_at) return { ok: false, error: "They're not on the floor." };
  if (openBreak) return { ok: false, error: "They're on a break — end it first." };

  const res = await doTakeClient(service, locationId, bd, emp.id, kind);
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

/**
 * Take a walk-in (one tap, no PIN — floor speed). Also serves as "+1 client"
 * while already attending: each tap opens one more customer.
 */
export async function storeTakeClient(employeeId: string): Promise<ActionResult> {
  return storeTake(employeeId, "walkin");
}

/**
 * Take a RETURN/EXCHANGE customer — its own open counter; the difference is
 * recorded at finish time (kind: "return", which doesn't burn a queue turn).
 */
export async function storeStartReturn(employeeId: string): Promise<ActionResult> {
  return storeTake(employeeId, "return");
}

const clientKindSchema = z.enum(["walkin", "return"]);

/**
 * Undo a mistaken take (one tap, no PIN — floor speed): closes ONE open
 * customer of `kind` as if it never happened. Nothing is recorded and no
 * rotation turn is burned.
 */
export async function storeUndoTake(
  employeeId: string,
  kind: "walkin" | "return",
): Promise<ActionResult> {
  const parsedKind = clientKindSchema.safeParse(kind);
  if (!parsedKind.success) return { ok: false, error: "Invalid input." };
  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  const res = await doUndoTake(service, locationId, bd, emp.id, parsedKind.data);
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

/** Cancel every open customer without recording anything ("back to line"). */
export async function storeSetAvailable(employeeId: string): Promise<ActionResult> {
  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  const res = await doClearAttending(service, locationId, bd, emp.id);
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

/**
 * Start a break: PIN-confirmed (break time is reviewed data). Rejected while
 * attending — finish or hand off the client first.
 */
export async function storeStartBreak(formData: FormData): Promise<ActionResult> {
  const parsed = parseStampForm(formData);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, parsed.data.employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  const bad = pinError(emp, parsed.data.pin);
  if (bad) return { ok: false, error: bad };

  const { data: row } = await service
    .from("floor_checkins")
    .select("left_at, status, attending_count, attending_return_count")
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", emp.id)
    .maybeSingle();
  if (!row || row.left_at) return { ok: false, error: "They're not on the floor." };
  if (row.status === "attending" || row.attending_count + row.attending_return_count > 0) {
    return { ok: false, error: "They're with a client — finish first." };
  }

  const res = await doStartBreak(service, locationId, bd, emp.id, new Date().toISOString());
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

/** End a break: PIN-confirmed; the member re-enters at their former position. */
export async function storeEndBreak(formData: FormData): Promise<ActionResult> {
  const parsed = parseStampForm(formData);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, parsed.data.employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  const bad = pinError(emp, parsed.data.pin);
  if (bad) return { ok: false, error: bad };

  const res = await doEndBreak(service, locationId, bd, emp.id, new Date().toISOString());
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

/** Move an employee to the front of the line (manual reorder). */
export async function storeMakeUpNext(employeeId: string): Promise<ActionResult> {
  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };

  // A stale tap must not bump someone who is (or just became) attending — the
  // leftover bump would put them at the front of the line when they finish.
  const { data: row } = await service
    .from("floor_checkins")
    .select("status, attending_count, attending_return_count")
    .eq("location_id", locationId)
    .eq("business_date", bd)
    .eq("employee_id", emp.id)
    .maybeSingle();
  if (
    !row ||
    row.status === "attending" ||
    row.attending_count + row.attending_return_count > 0
  ) {
    return { ok: false, error: "They're with a client — try again after." };
  }

  const res = await patchCheckin(service, locationId, bd, emp.id, {
    bumped_at: new Date().toISOString(),
  });
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

const reorderSchema = z.array(uuid).min(1).max(30);

/**
 * Persist a kiosk drag-reorder of the waiting line. The submitted set must
 * exactly match today's present available members (a stale drag after the
 * line changed is rejected). Positions supersede earlier bumps.
 */
export async function storeReorderQueue(orderedIds: string[]): Promise<ActionResult> {
  const parsed = reorderSchema.safeParse(orderedIds);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { locationId, service, bd } = await storeCtx();
  const [{ data: rows }, { data: openBreaks }] = await Promise.all([
    service
      .from("floor_checkins")
      .select("employee_id, status, attending_count, attending_return_count")
      .eq("location_id", locationId)
      .eq("business_date", bd)
      .is("left_at", null),
    service
      .from("floor_breaks")
      .select("employee_id")
      .eq("location_id", locationId)
      .eq("business_date", bd)
      .is("ended_at", null),
  ]);
  // On-break members aren't in the visible line, so they can't be in the
  // submitted order — exclude them from the expected set too.
  const onBreak = new Set((openBreaks ?? []).map((b) => b.employee_id));
  const available = new Set(
    (rows ?? [])
      .filter(
        (r) =>
          r.attending_count + r.attending_return_count === 0 &&
          r.status !== "attending" &&
          !onBreak.has(r.employee_id),
      )
      .map((r) => r.employee_id),
  );
  const submitted = new Set(parsed.data);
  if (
    submitted.size !== parsed.data.length ||
    available.size !== submitted.size ||
    ![...submitted].every((id) => available.has(id))
  ) {
    return { ok: false, error: "The line changed — try again." };
  }

  // One statement so the reorder is all-or-nothing — a partial loop failure
  // would leave an interleaved order. On conflict only the listed columns
  // update; the set check above guarantees every row already exists.
  const { error } = await service.from("floor_checkins").upsert(
    parsed.data.map((employeeId, i) => ({
      location_id: locationId,
      business_date: bd,
      employee_id: employeeId,
      manual_pos: i + 1,
      bumped_at: null,
    })),
    { onConflict: "location_id,business_date,employee_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/store", "layout");
  return { ok: true };
}

/**
 * Record the customer result and free the employee (a walk-in rotates them to
 * the back of the line; a return keeps their turn). No-sale walk-ins carry
 * their mandatory reasons here.
 */
export async function storeFinish(
  employeeId: string,
  input: FinishInput,
): Promise<ActionResult> {
  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error) };
  }

  const d = parsed.data;
  const res = await doFinishCustomer(service, locationId, bd, emp.id, {
    kind: d.kind,
    sold: d.sold,
    got_contact: d.kind === "walkin" ? d.got_contact : false,
    reasons: d.kind === "walkin" && !d.sold ? d.reasons : undefined,
    products: d.kind === "walkin" && !d.sold ? d.products : undefined,
    note: d.kind === "walkin" && !d.sold ? d.note : undefined,
  });
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

const searchSchema = z.string().trim().min(2).max(60);

/** Product search for no-sale tagging; degrades to [] when Shopify is down. */
export async function storeSearchProducts(
  query: string,
): Promise<ActionResult<ProductHit[]>> {
  await requireStore();
  const parsed = searchSchema.safeParse(query);
  if (!parsed.success) return { ok: true, data: [] };
  if (!isShopifyConfigured()) return { ok: true, data: [] };
  try {
    return { ok: true, data: await searchProducts(parsed.data) };
  } catch {
    return { ok: true, data: [] };
  }
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
