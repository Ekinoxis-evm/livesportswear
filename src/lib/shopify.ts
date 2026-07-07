import "server-only";
import {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,
  SHOPIFY_ADMIN_TOKEN,
  SHOPIFY_API_VERSION,
} from "@/lib/shopify-config";

// Staff attribution uses the REST orders API: order.user_id and the order
// timeline's "placed" author come with read_orders alone, while GraphQL's
// Order.staffMember requires the read_users scope, which Shopify only grants
// via a support request. Revisit if that scope is ever enabled for the app.

// Client-credentials tokens live 24h; cache per instance and refresh early.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (SHOPIFY_ADMIN_TOKEN) return SHOPIFY_ADMIN_TOKEN;
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
      }),
    },
  );
  if (!res.ok) throw new Error(`Shopify auth error ${res.status}`);
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error("Shopify auth: no access token returned.");
  }
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 86_399) * 1000,
  };
  return cachedToken.token;
}

async function shopifyRest<T>(
  path: string,
): Promise<{ body: T; nextPageInfo: string | null }> {
  const call = async (token: string) =>
    fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
      headers: { "X-Shopify-Access-Token": token },
    });

  let res = await call(await getAccessToken());
  if (res.status === 401 && !SHOPIFY_ADMIN_TOKEN) {
    cachedToken = null; // token revoked or expired early — mint a fresh one
    res = await call(await getAccessToken());
  }
  if (!res.ok) throw new Error(`Shopify API error ${res.status}`);
  const link = res.headers.get("link") ?? "";
  const next = link.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return { body: (await res.json()) as T, nextPageInfo: next ? next[1] : null };
}

export type ShopifyStaff = { id: string; name: string; email: string | null };

type RestOrder = {
  id: number;
  user_id: number | null;
  cancelled_at: string | null;
  test: boolean;
  current_total_price: string;
};

const ORDER_FIELDS = "id,user_id,cancelled_at,test,current_total_price";

export type StaffSales = {
  /** staff user_id (numeric string) → summed current order totals */
  totals: Map<string, number>;
  /** staff user_id → one order id, for name lookup via the order timeline */
  sampleOrder: Map<string, number>;
};

/**
 * Per-staff sales totals for [start, endExclusive) — UTC ISO instants (callers
 * pass store-local month boundaries). Only POS-attributed orders (user_id);
 * cancelled and test orders are excluded. Paginates fully.
 */
export async function fetchStaffSales(
  start: string,
  endExclusive: string,
): Promise<StaffSales> {
  // REST created_at_max is inclusive — step back one second from the bound.
  const max = new Date(new Date(endExclusive).getTime() - 1000).toISOString();
  const totals = new Map<string, number>();
  const sampleOrder = new Map<string, number>();

  let path: string | null =
    `/orders.json?status=any&limit=250&fields=${ORDER_FIELDS}` +
    `&created_at_min=${encodeURIComponent(start)}&created_at_max=${encodeURIComponent(max)}`;
  while (path) {
    const { body, nextPageInfo }: { body: { orders: RestOrder[] }; nextPageInfo: string | null } =
      await shopifyRest<{ orders: RestOrder[] }>(path);
    for (const o of body.orders) {
      if (!o.user_id || o.cancelled_at || o.test) continue;
      const staffId = String(o.user_id);
      const amount = Number(o.current_total_price) || 0;
      totals.set(staffId, (totals.get(staffId) ?? 0) + amount);
      if (!sampleOrder.has(staffId)) sampleOrder.set(staffId, o.id);
    }
    path = nextPageInfo
      ? `/orders.json?limit=250&fields=${ORDER_FIELDS}&page_info=${nextPageInfo}`
      : null;
  }
  return { totals, sampleOrder };
}

type RestEvent = { verb: string; author: string | null };

/**
 * Staff display names from each staff member's sample order timeline — the
 * "placed" event's author is the POS staff member who processed the sale.
 */
export async function fetchStaffNames(
  sampleOrder: Map<string, number>,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const [staffId, orderId] of sampleOrder) {
    const { body } = await shopifyRest<{ events: RestEvent[] }>(
      `/orders/${orderId}/events.json?limit=10`,
    );
    const placed = body.events.find(
      (e) => e.verb === "placed" && e.author && e.author !== "Shopify",
    );
    if (placed?.author) names.set(staffId, placed.author);
  }
  return names;
}

/**
 * Staff members seen in the last ~2 months of orders, with names — feeds the
 * admin mapping panel. Emails aren't exposed on this path.
 */
export async function listStaffMembers(): Promise<ShopifyStaff[]> {
  const since = new Date(Date.now() - 62 * 24 * 3600 * 1000).toISOString();
  const { totals, sampleOrder } = await fetchStaffSales(
    since,
    new Date().toISOString(),
  );
  const names = await fetchStaffNames(sampleOrder);
  return [...totals.keys()]
    .map((id) => ({ id, name: names.get(id) ?? `Staff ${id}`, email: null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
