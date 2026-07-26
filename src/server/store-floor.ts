"use server";

import { z } from "zod";
import { formatInTimeZone } from "date-fns-tz";
import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { retakePatch, type RetakeOrder } from "@/lib/retake";
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
  sendTestReportFor,
  type CloseDayDraft,
} from "@/server/conversion-core";
import { isShopifyConfigured } from "@/lib/shopify-config";
import {
  searchProducts,
  fetchRecentOrders,
  fetchOrderById,
  fetchCustomersDetails,
  fetchCustomerOrders,
  searchCustomers,
  type ProductHit,
  type RecentOrder,
  type ShopifyCustomer,
} from "@/lib/shopify";
import { finishSchema, type FinishInput } from "@/lib/finish-schema";
import { buildMessage } from "@/lib/client-message";
import { whatsappLink } from "@/lib/contact-links";
import { countryFromIso, type Country } from "@/lib/phone-country";
import { MESSAGE_LANGUAGES, MESSAGE_KEYS } from "@/lib/message-languages";
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
  return { locationId, service, tz, bd: businessDate(tz) };
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

/** End a break: PIN-confirmed; the member rejoins at the BACK of the line. */
export async function storeEndBreak(formData: FormData): Promise<ActionResult> {
  const parsed = parseStampForm(formData);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, parsed.data.employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };
  const bad = pinError(emp, parsed.data.pin);
  if (bad) return { ok: false, error: bad };

  const now = new Date().toISOString();
  const res = await doEndBreak(service, locationId, bd, emp.id, now);
  if (res.ok) {
    // Coming back from a break sends you to the end of the line — restamp
    // available_since (and clear any stale bump/drag so it can't jump the
    // queue). Whoever kept working while they were away is now ahead.
    await patchCheckin(service, locationId, bd, emp.id, {
      available_since: now,
      bumped_at: null,
      manual_pos: null,
    });
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
    return_type: d.kind === "return" ? d.return_type : undefined,
    got_contact: d.kind === "walkin" ? d.got_contact : false,
    reasons: d.kind === "walkin" && !d.sold ? d.reasons : undefined,
    products: d.kind === "walkin" && !d.sold ? d.products : undefined,
    note: d.kind === "walkin" && !d.sold ? d.note : undefined,
    orders: d.kind === "walkin" && d.sold ? d.orders : undefined,
  });
  if (res.ok) {
    revalidatePath("/store", "layout");
  }
  return res;
}

export type RetakeCandidate = {
  id: string;
  time: string;
  sold: boolean;
  isReturn: boolean;
  customer: string | null;
  orderName: string | null;
  orderTotal: number | null;
};

// Mirrors the order shape the finish flow already sends (lib/finish-schema.ts).
const retakeOrderSchema = z.object({
  id: z.string().min(1).max(30),
  name: z.string().min(1).max(30),
  total: z.number().min(0),
  customer_id: z.string().max(30).nullish(),
  customer_name: z.string().max(120).nullish(),
});

/** Today's attendances for one employee — the pick-list for a re-take. */
export async function storeRetakeCandidates(
  employeeId: string,
): Promise<ActionResult<RetakeCandidate[]>> {
  const { locationId, service, bd, tz } = await storeCtx();
  const emp = await targetEmployee(service, locationId, employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };

  const { data, error } = await service
    .from("client_events")
    .select(
      "id, attended_at, sold, kind, customer_name, shopify_order_name, order_total",
    )
    .eq("location_id", locationId)
    .eq("employee_id", emp.id)
    .eq("business_date", bd)
    .order("attended_at", { ascending: false });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: (data ?? []).map((e) => ({
      id: e.id,
      time: formatInTimeZone(new Date(e.attended_at), tz, "HH:mm"),
      sold: e.sold,
      isReturn: e.kind === "return",
      customer: e.customer_name,
      orderName: e.shopify_order_name,
      orderTotal: e.order_total == null ? null : Number(e.order_total),
    })),
  };
}

const retakeSchema = z.object({
  employeeId: z.string().uuid(),
  eventId: z.string().uuid(),
  // The outcome of the return visit: bought more (with the orders it linked) or
  // came back and still didn't buy (optionally capturing contact this time).
  sold: z.boolean(),
  orders: z.array(retakeOrderSchema).max(10).optional(),
  gotContact: z.boolean().optional(),
});

/**
 * A client the rep already attended today came back and bought. Adds the sale to
 * the attendance she ALREADY logged instead of creating a new one, so the same
 * person isn't counted twice against conversion.
 *
 * The scoping below IS the security boundary: the event must belong to this
 * employee, at the store in the JWT claim, on TODAY's business date. Without the
 * date check a kiosk left open overnight could rewrite yesterday's closed
 * numbers.
 */
export async function storeRetake(input: unknown): Promise<ActionResult> {
  const { locationId, service, bd } = await storeCtx();
  const parsed = retakeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const emp = await targetEmployee(service, locationId, parsed.data.employeeId);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };

  const { data: existing } = await service
    .from("client_events")
    .select(
      "sold, got_contact, order_total, shopify_order_id, shopify_order_name, shopify_customer_id, customer_name, linked_orders",
    )
    .eq("id", parsed.data.eventId)
    .eq("location_id", locationId)
    .eq("employee_id", emp.id)
    .eq("business_date", bd)
    .maybeSingle();
  if (!existing) {
    return { ok: false, error: "That client isn't on today's list for this person." };
  }

  const patch = retakePatch(
    { ...existing, linked_orders: existing.linked_orders as RetakeOrder[] | null },
    parsed.data.sold
      ? { sold: true, orders: parsed.data.orders ?? [], gotContact: parsed.data.gotContact }
      : { sold: false, gotContact: parsed.data.gotContact },
  );
  const { error } = await service
    .from("client_events")
    .update(patch)
    .eq("id", parsed.data.eventId)
    .eq("location_id", locationId)
    .eq("business_date", bd);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/store", "layout");
  return { ok: true };
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
 * The store's latest orders for the sold→order pick step; degrades to []
 * when Shopify is down so a sale is never blocked on the link.
 */
export async function storeRecentOrders(): Promise<ActionResult<RecentOrder[]>> {
  await requireStore();
  if (!isShopifyConfigured()) return { ok: true, data: [] };
  try {
    // 12, not the default 6: "my order isn't in the list" was the main reason
    // reps skipped linking, and an unlinked sale loses its client.
    return { ok: true, data: await fetchRecentOrders(12) };
  } catch {
    return { ok: true, data: [] };
  }
}

const thankYouSchema = z.object({
  orderId: z.string().min(1).max(30),
  language: z.enum(MESSAGE_LANGUAGES),
});

/**
 * Build the thank-you WhatsApp link for a just-sold order. Resolves the
 * client's phone + the garments server-side (never shipped in the general order
 * list), fills the admin template, and returns a `wa.me` URL for the kiosk to
 * open. The phone rides only in this URL for this one action — never stored,
 * never logged.
 */
export async function storeThankYouLink(
  input: unknown,
): Promise<ActionResult<{ url: string }>> {
  const { locationId, service } = await storeCtx();
  const parsed = thankYouSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (!isShopifyConfigured()) {
    return { ok: false, error: "Shopify is unavailable right now." };
  }

  const { data: template } = await service
    .from("message_templates")
    .select("body")
    .eq("location_id", locationId)
    .eq("key", "thank_you")
    .eq("language", parsed.data.language)
    .maybeSingle();
  if (!template?.body) {
    return { ok: false, error: "No message set for that language yet." };
  }

  let order;
  try {
    order = await fetchOrderById(parsed.data.orderId);
  } catch {
    return { ok: false, error: "Couldn't reach Shopify — try again." };
  }
  if (!order?.customer) {
    return { ok: false, error: "This sale has no customer to message." };
  }

  const text = buildMessage({
    body: template.body,
    name: order.customer.name,
    appendItems: order.items,
    language: parsed.data.language,
  });
  const url = whatsappLink(order.customer.phone, text);
  if (!url) {
    return {
      ok: false,
      error: "This client's number has no country code — can't open WhatsApp.",
    };
  }
  return { ok: true, data: { url } };
}

// ---------------------------------------------------------------------------
// Store clients page — the floor's own view of the client book (customer_origin
// for this location), with the "in WhatsApp" flag + WhatsApp sends. Every query
// is scoped to the JWT location, the kiosk single-writer boundary.
// ---------------------------------------------------------------------------

export type StoreClient = {
  customerId: string;
  name: string;
  country: Country | null;
  firstOrderAt: string | null;
  inWhatsapp: boolean;
  phone: string | null;
  orders: number | null;
  spent: number | null;
};

const CLIENTS_PAGE = 50;
const listClientsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(60).optional(),
});

type OriginRow = {
  shopify_customer_id: string;
  first_order_at: string;
  customer_name: string | null;
  orders_count: number | null;
  total_spent: number | null;
  country_iso: string | null;
  in_whatsapp: boolean;
};
const ORIGIN_COLS =
  "shopify_customer_id, first_order_at, customer_name, orders_count, total_spent, country_iso, in_whatsapp";

export async function storeListClients(
  input: unknown,
): Promise<ActionResult<{ clients: StoreClient[]; total: number; pages: number }>> {
  const { locationId, service } = await storeCtx();
  const parsed = listClientsSchema.safeParse(input ?? {});
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { page } = parsed.data;
  const q = parsed.data.q ?? "";

  let origins: OriginRow[] = [];
  let total = 0;

  if (q) {
    // Search Shopify, then annotate with our rows (unmatched customers dropped —
    // this is the store's own book, so a stranger with no origin row isn't shown).
    const found = isShopifyConfigured() ? await searchCustomers(q).catch(() => null) : [];
    if (found && found.length) {
      const { data } = await service
        .from("customer_origin")
        .select(ORIGIN_COLS)
        .eq("location_id", locationId)
        .in("shopify_customer_id", found.map((c) => c.id));
      origins = (data ?? []) as OriginRow[];
      total = origins.length;
    }
  } else {
    const { data, count } = await service
      .from("customer_origin")
      .select(ORIGIN_COLS, { count: "exact" })
      .eq("location_id", locationId)
      .order("first_order_at", { ascending: false })
      .range((page - 1) * CLIENTS_PAGE, page * CLIENTS_PAGE - 1);
    origins = (data ?? []) as OriginRow[];
    total = count ?? 0;
  }

  // Live phone for the visible page only — never stored, for the contact/send.
  const contact =
    origins.length > 0 && isShopifyConfigured()
      ? await fetchCustomersDetails(origins.map((o) => o.shopify_customer_id)).catch(
          () => null,
        )
      : new Map<string, ShopifyCustomer>();
  const byId = contact ?? new Map<string, ShopifyCustomer>();

  const clients: StoreClient[] = origins.map((o) => ({
    customerId: o.shopify_customer_id,
    name: o.customer_name ?? "Customer",
    country: countryFromIso(o.country_iso),
    firstOrderAt: o.first_order_at || null,
    inWhatsapp: o.in_whatsapp,
    phone: byId.get(o.shopify_customer_id)?.phone ?? null,
    orders: o.orders_count,
    spent: o.total_spent,
  }));

  return {
    ok: true,
    data: { clients, total, pages: Math.max(1, Math.ceil(total / CLIENTS_PAGE)) },
  };
}

const setWhatsappSchema = z.object({
  customerId: z.string().min(1).max(30),
  value: z.boolean(),
});

/** Mark whether this client's number is saved in the store WhatsApp. */
export async function storeSetInWhatsapp(input: unknown): Promise<ActionResult> {
  const { locationId, service } = await storeCtx();
  const parsed = setWhatsappSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const { error } = await service
    .from("customer_origin")
    .update({ in_whatsapp: parsed.data.value })
    .eq("location_id", locationId)
    .eq("shopify_customer_id", parsed.data.customerId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/store/clients");
  return { ok: true };
}

const messageLinkSchema = z.object({
  customerId: z.string().min(1).max(30),
  key: z.enum(MESSAGE_KEYS),
  language: z.enum(MESSAGE_LANGUAGES),
});

/**
 * Build the WhatsApp link to message a client from the clients page. Reads the
 * template, resolves the client's phone + last purchase server-side, and returns
 * a `wa.me` URL. The thank-you appends the last order's items; the hello fills
 * `{last_product}`.
 */
export async function storeMessageLink(
  input: unknown,
): Promise<ActionResult<{ url: string }>> {
  const { locationId, service } = await storeCtx();
  const parsed = messageLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  if (!isShopifyConfigured()) {
    return { ok: false, error: "Shopify is unavailable right now." };
  }

  const { data: template } = await service
    .from("message_templates")
    .select("body")
    .eq("location_id", locationId)
    .eq("key", parsed.data.key)
    .eq("language", parsed.data.language)
    .maybeSingle();
  if (!template?.body) {
    return { ok: false, error: "No message set for that language yet." };
  }

  let orders;
  let cust: ShopifyCustomer | null;
  try {
    [orders, cust] = await Promise.all([
      fetchCustomerOrders(parsed.data.customerId, 5),
      fetchCustomersDetails([parsed.data.customerId]).then(
        (m) => m.get(parsed.data.customerId) ?? null,
      ),
    ]);
  } catch {
    return { ok: false, error: "Couldn't reach Shopify — try again." };
  }
  const last = orders[0];

  const text = buildMessage({
    body: template.body,
    name: cust?.name,
    language: parsed.data.language,
    lastProduct: last?.items[0]?.title ?? null,
    appendItems: parsed.data.key === "thank_you" ? last?.items : undefined,
  });
  const url = whatsappLink(cust?.phone, text);
  if (!url) {
    return {
      ok: false,
      error: "This client's number has no country code — can't open WhatsApp.",
    };
  }
  return { ok: true, data: { url } };
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
export async function storeCloseDay(
  closedById: string,
  onlyRecipients?: string[],
): Promise<ActionResult> {
  const { locationId, service, bd } = await storeCtx();
  const emp = await targetEmployee(service, locationId, closedById);
  if (!emp) return { ok: false, error: "That employee isn't at this store." };

  const res = await closeDayFor(
    { id: emp.id, name: emp.name, location_id: locationId },
    onlyRecipients,
  );
  if (res.ok) {
    // End the day's queue so the board stops offering "take a client". This
    // deliberately does NOT check anyone out — the closer does this during
    // their shift when the store shuts, and everyone still taps their own PIN
    // checkout. Forcing it here would cut short the hours of whoever is still
    // working after the report goes out.
    await service
      .from("floor_days")
      .update({ closed_at: new Date().toISOString(), closed_by: emp.id })
      .eq("location_id", locationId)
      .eq("business_date", bd)
      .is("closed_at", null);
    revalidatePath("/store", "layout");
  }
  return res;
}

// ---------------------------------------------------------------------------
// Daily-report test send — store-scoped: the location is the store JWT's claim,
// never an input. (Recipient editing lives in the shared RecipientsManager.)
// ---------------------------------------------------------------------------
export async function storeSendTestReport(
  onlyRecipients?: string[],
): Promise<ActionResult<{ sentTo: number }>> {
  const { locationId } = await storeCtx();
  return sendTestReportFor(locationId, onlyRecipients);
}
