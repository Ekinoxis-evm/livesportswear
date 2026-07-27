"use server";

import { z } from "zod";
import { requireEmployee } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { isShopifyConfigured } from "@/lib/shopify-config";
import {
  fetchCustomerOrders,
  fetchCustomersDetails,
  type ShopifyCustomer,
} from "@/lib/shopify";
import { normalizeStaffId } from "@/lib/shopify-range";
import { buildMessage } from "@/lib/client-message";
import { whatsappLink } from "@/lib/contact-links";
import { MESSAGE_LANGUAGES, MESSAGE_KEYS } from "@/lib/message-languages";
import { firstError, type ActionResult } from "@/server/shared";

const messageLinkSchema = z.object({
  customerId: z.string().min(1).max(30),
  key: z.enum(MESSAGE_KEYS),
  language: z.enum(MESSAGE_LANGUAGES),
});

/**
 * Portal counterpart of the kiosk's `storeMessageLink`: a rep messages one of
 * THEIR OWN clients from the portal Clients tab. Ownership is re-checked
 * server-side against the customer's attributed staff id (a bare "Not found."
 * on a miss, never confirming the client exists), and the message is signed
 * with the rep's own name.
 */
export async function portalMessageLink(
  input: unknown,
): Promise<ActionResult<{ url: string }>> {
  const parsed = messageLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const { employee } = await requireEmployee();
  if (!employee.shopify_staff_id) {
    return { ok: false, error: "Your Shopify profile isn't linked yet." };
  }
  if (!isShopifyConfigured()) {
    return { ok: false, error: "Shopify is unavailable right now." };
  }
  const myStaff = normalizeStaffId(employee.shopify_staff_id);
  const service = createServiceClient();

  // This client must be one the rep brought in (their staff id on the origin).
  const { data: origin } = await service
    .from("customer_origin")
    .select("staff_id")
    .eq("location_id", employee.location_id)
    .eq("shopify_customer_id", parsed.data.customerId)
    .maybeSingle();
  if (!origin?.staff_id || normalizeStaffId(origin.staff_id) !== myStaff) {
    return { ok: false, error: "Not found." };
  }

  const { data: template } = await service
    .from("message_templates")
    .select("body")
    .eq("location_id", employee.location_id)
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
    signature: employee.name, // the rep signs as themselves
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
