import "server-only";
import {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,
  SHOPIFY_ADMIN_TOKEN,
  SHOPIFY_API_VERSION,
} from "@/lib/shopify-config";
import {
  addBreakdown,
  orderBreakdown,
  roundBreakdown,
  zeroBreakdown,
  type SalesBreakdown,
} from "@/lib/sales-breakdown";

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
  current_subtotal_price: string;
  total_line_items_price: string;
  total_discounts: string;
  subtotal_price: string;
};

// current_subtotal_price = NET sales: after discounts and refunds, excluding
// taxes and shipping — the metric every sales number in the app uses. The
// extra money fields decompose it: gross − discounts − returns = net
// (see lib/sales-breakdown.ts).
const ORDER_FIELDS =
  "id,user_id,cancelled_at,test,current_subtotal_price," +
  "total_line_items_price,total_discounts,subtotal_price";

export type StaffSales = {
  /** staff user_id (numeric string) → summed sales breakdown (net = the metric) */
  totals: Map<string, SalesBreakdown>;
  /** staff user_id → one order id, for name lookup via the order timeline */
  sampleOrder: Map<string, number>;
};

/**
 * Per-staff NET sales totals (after discounts/refunds, excl. taxes+shipping)
 * for [start, endExclusive) — UTC ISO instants (callers
 * pass store-local month boundaries). Only POS-attributed orders (user_id);
 * cancelled and test orders are excluded. Paginates fully.
 */
export async function fetchStaffSales(
  start: string,
  endExclusive: string,
): Promise<StaffSales> {
  // REST created_at_max is inclusive — step back one second from the bound.
  const max = new Date(new Date(endExclusive).getTime() - 1000).toISOString();
  const totals = new Map<string, SalesBreakdown>();
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
      totals.set(
        staffId,
        addBreakdown(totals.get(staffId) ?? zeroBreakdown(), orderBreakdown(o)),
      );
      if (!sampleOrder.has(staffId)) sampleOrder.set(staffId, o.id);
    }
    path = nextPageInfo
      ? `/orders.json?limit=250&fields=${ORDER_FIELDS}&page_info=${nextPageInfo}`
      : null;
  }
  for (const [staffId, b] of totals) totals.set(staffId, roundBreakdown(b));
  return { totals, sampleOrder };
}

export type DaySales = SalesBreakdown & {
  /** kept as an alias of `net` — the number older consumers read */
  total: number;
  currency: string | null;
  orders: number;
};

/**
 * The store's total NET sales for [start, endExclusive) — all non-cancelled,
 * non-test orders regardless of staff attribution (the day's money line) —
 * with the gross/discounts/returns decomposition alongside.
 */
export async function fetchDaySales(
  start: string,
  endExclusive: string,
): Promise<DaySales> {
  const max = new Date(new Date(endExclusive).getTime() - 1000).toISOString();
  const fields = `${ORDER_FIELDS},currency`;
  let sum = zeroBreakdown();
  let orders = 0;
  let currency: string | null = null;

  let path: string | null =
    `/orders.json?status=any&limit=250&fields=${fields}` +
    `&created_at_min=${encodeURIComponent(start)}&created_at_max=${encodeURIComponent(max)}`;
  while (path) {
    const page: { body: { orders: (RestOrder & { currency?: string })[] }; nextPageInfo: string | null } =
      await shopifyRest(path);
    for (const o of page.body.orders) {
      if (o.cancelled_at || o.test) continue;
      sum = addBreakdown(sum, orderBreakdown(o));
      orders++;
      currency ??= o.currency ?? null;
    }
    path = page.nextPageInfo
      ? `/orders.json?limit=250&fields=${fields}&page_info=${page.nextPageInfo}`
      : null;
  }
  const b = roundBreakdown(sum);
  return { ...b, total: b.net, currency, orders };
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

export type ProductHit = {
  id: string;
  title: string;
  sku: string | null;
  image: string | null;
};

async function shopifyGraphql<T>(query: string, variables: object): Promise<T> {
  const call = async (token: string) =>
    fetch(
      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      },
    );

  let res = await call(await getAccessToken());
  if (res.status === 401 && !SHOPIFY_ADMIN_TOKEN) {
    cachedToken = null; // token revoked or expired early — mint a fresh one
    res = await call(await getAccessToken());
  }
  if (!res.ok) throw new Error(`Shopify API error ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length || !json.data) {
    throw new Error(`Shopify GraphQL: ${json.errors?.[0]?.message ?? "no data"}`);
  }
  return json.data;
}

type ProductSearchData = {
  products: {
    nodes: {
      id: string;
      title: string;
      variants: { nodes: { sku: string | null }[] } | null;
      featuredMedia: { preview: { image: { url: string } | null } | null } | null;
    }[];
  };
};

/**
 * Matches title OR variant SKU (the number on the garment tag), both
 * contains-style — feeds the no-sale product tags. GraphQL, because the REST
 * products.json title filter is EXACT-match on modern API versions (verified
 * live: "shorts" → 0 hits on a 3,596-product store) — it silently found
 * nothing.
 */
export async function searchProducts(query: string): Promise<ProductHit[]> {
  const sanitized = query.replace(/["\\()]/g, " ").trim();
  if (!sanitized) return [];
  const data = await shopifyGraphql<ProductSearchData>(
    `query($q: String!) {
      products(first: 10, query: $q) {
        nodes {
          id
          title
          variants(first: 10) { nodes { sku } }
          featuredMedia { preview { image { url } } }
        }
      }
    }`,
    { q: `title:*${sanitized}* OR sku:*${sanitized}*` },
  );
  return data.products.nodes.map((p) => ({
    id: p.id.split("/").pop() ?? p.id,
    title: p.title,
    sku: p.variants?.nodes.find((v) => v.sku)?.sku ?? null,
    image: p.featuredMedia?.preview?.image?.url ?? null,
  }));
}

export type VariantHit = {
  barcode: string;
  sku: string | null;
  productTitle: string;
  variantTitle: string | null; // usually the size, e.g. "S / 0LJ104"
  inventoryQuantity: number | null; // Shopify's expected stock
};

type VariantNodes = {
  productVariants: {
    nodes: {
      barcode: string | null;
      sku: string | null;
      title: string | null;
      inventoryQuantity: number | null;
      product: { title: string };
    }[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
};

const variantHit = (v: VariantNodes["productVariants"]["nodes"][number]): VariantHit => ({
  barcode: v.barcode ?? "",
  sku: v.sku || null,
  productTitle: v.product.title,
  variantTitle: v.title || null,
  inventoryQuantity: v.inventoryQuantity ?? null,
});

/** Resolve one scanned barcode to its variant; null when not in the catalog. */
export async function lookupVariantByBarcode(
  barcode: string,
): Promise<VariantHit | null> {
  const sanitized = barcode.replace(/["\\()]/g, "").trim();
  if (!sanitized) return null;
  const data = await shopifyGraphql<VariantNodes>(
    `query($q: String!) {
      productVariants(first: 1, query: $q) {
        nodes { barcode sku title inventoryQuantity product { title } }
      }
    }`,
    { q: `barcode:${sanitized}` },
  );
  const v = data.productVariants.nodes[0];
  return v ? variantHit(v) : null;
}

/**
 * The whole catalog's variants with expected stock — the finalize sweep that
 * finds what a physical count never scanned. Paginated; ~250/page over the
 * full catalog, so callers run it server-side once per finalize, never per scan.
 */
export async function fetchAllTrackedVariants(): Promise<VariantHit[]> {
  const all: VariantHit[] = [];
  let cursor: string | null = null;
  do {
    const data: VariantNodes = await shopifyGraphql<VariantNodes>(
      `query($after: String) {
        productVariants(first: 250, after: $after) {
          nodes { barcode sku title inventoryQuantity product { title } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after: cursor },
    );
    for (const v of data.productVariants.nodes) {
      if (v.barcode) all.push(variantHit(v));
    }
    const page = data.productVariants.pageInfo;
    cursor = page?.hasNextPage ? (page.endCursor ?? null) : null;
  } while (cursor);
  return all;
}

export type TenderRow = {
  amount: number; // negative = refund
  payment_method: string; // "cash" | "credit_card" | ...
  processed_at: string;
};

type RestTender = {
  amount: string;
  payment_method: string | null;
  processed_at: string;
  test: boolean;
};

/**
 * Every tender transaction processed in [start, endExclusive) — payments AND
 * refunds (refunds are negative amounts). This is the cash-drawer truth for
 * the day: cash received, card volume, and money refunded.
 */
export async function fetchDayTenders(
  start: string,
  endExclusive: string,
): Promise<TenderRow[]> {
  const max = new Date(new Date(endExclusive).getTime() - 1000).toISOString();
  const rows: TenderRow[] = [];
  let path: string | null =
    `/tender_transactions.json?limit=250` +
    `&processed_at_min=${encodeURIComponent(start)}&processed_at_max=${encodeURIComponent(max)}`;
  while (path) {
    const { body, nextPageInfo }: { body: { tender_transactions: RestTender[] }; nextPageInfo: string | null } =
      await shopifyRest<{ tender_transactions: RestTender[] }>(path);
    for (const t of body.tender_transactions) {
      if (t.test) continue;
      rows.push({
        amount: Number(t.amount) || 0,
        payment_method: t.payment_method ?? "other",
        processed_at: t.processed_at,
      });
    }
    path = nextPageInfo
      ? `/tender_transactions.json?limit=250&page_info=${nextPageInfo}`
      : null;
  }
  return rows;
}
