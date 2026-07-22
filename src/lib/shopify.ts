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

export type DayOrder = {
  id: string;
  name: string; // Shopify order name, e.g. "#1234"
  createdAt: string;
  net: number; // current_subtotal_price (the metric)
  currency: string | null;
  sourceName: string | null; // "pos" = in-store POS; "web"/checkout = online
  staffId: string | null; // REST user_id; present on POS orders, null online
  // Id + creation instant only — enough to tell a brand-new client from a
  // returning one without pulling any customer contact into this path.
  // `createdAt` is null when Shopify omits it: the client still counts as
  // served, just never as new.
  customer: { id: string; createdAt: string | null } | null;
};

type RestDayOrder = RestOrder & {
  name: string | null;
  created_at: string;
  currency: string | null;
  source_name: string | null;
  customer: { id: number; created_at: string | null } | null;
};

const ORDER_LIST_FIELDS =
  "id,name,created_at,user_id,source_name,cancelled_at,test,current_subtotal_price,currency,customer";

/**
 * Every non-cancelled/non-test order for [start, endExclusive) as individual
 * rows (newest-first not guaranteed — caller sorts) — the per-order data the
 * aggregate fetchers discard. Carries `source_name` (POS vs online) and
 * `user_id` (POS staff) so callers can split by channel and attribute to staff.
 * Paginates fully.
 */
export async function fetchDayOrders(
  start: string,
  endExclusive: string,
): Promise<DayOrder[]> {
  const max = new Date(new Date(endExclusive).getTime() - 1000).toISOString();
  const out: DayOrder[] = [];
  let path: string | null =
    `/orders.json?status=any&limit=250&fields=${ORDER_LIST_FIELDS}` +
    `&created_at_min=${encodeURIComponent(start)}&created_at_max=${encodeURIComponent(max)}`;
  while (path) {
    const page: { body: { orders: RestDayOrder[] }; nextPageInfo: string | null } =
      await shopifyRest<{ orders: RestDayOrder[] }>(path);
    for (const o of page.body.orders) {
      if (o.cancelled_at || o.test) continue;
      out.push({
        id: String(o.id),
        name: o.name ?? `#${o.id}`,
        createdAt: o.created_at,
        net: Number(o.current_subtotal_price ?? 0),
        currency: o.currency ?? null,
        sourceName: o.source_name ?? null,
        staffId: o.user_id != null ? String(o.user_id) : null,
        customer: o.customer
          ? { id: String(o.customer.id), createdAt: o.customer.created_at ?? null }
          : null,
      });
    }
    path = page.nextPageInfo
      ? `/orders.json?limit=250&fields=${ORDER_LIST_FIELDS}&page_info=${page.nextPageInfo}`
      : null;
  }
  return out;
}

export type RecentOrder = {
  id: string;
  name: string; // Shopify order name, e.g. "#1234"
  createdAt: string;
  net: number;
  currency: string | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
};

type RestRecentOrder = RestOrder & {
  name: string | null;
  created_at: string;
  currency: string | null;
  customer: {
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

/**
 * The store's most recent orders, newest first — the pick-list the kiosk
 * shows when a rep marks SOLD, so the client event links the real order and
 * its customer. Customer contact must never be logged (security.md).
 */
export async function fetchRecentOrders(limit = 6): Promise<RecentOrder[]> {
  const fields =
    "id,name,created_at,cancelled_at,test,current_subtotal_price,currency,customer";
  // Over-fetch a little so filtered cancelled/test orders don't shrink the list.
  const { body } = await shopifyRest<{ orders: RestRecentOrder[] }>(
    `/orders.json?status=any&limit=${limit + 4}&fields=${fields}`,
  );
  return body.orders
    .filter((o) => !o.cancelled_at && !o.test)
    .slice(0, limit)
    .map((o) => {
      const customerName = [o.customer?.first_name, o.customer?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      return {
        id: String(o.id),
        name: o.name ?? `#${o.id}`,
        createdAt: o.created_at,
        net: Number(o.current_subtotal_price ?? 0),
        currency: o.currency ?? null,
        customer: o.customer
          ? {
              id: String(o.customer.id),
              name: customerName || "Customer",
              email: o.customer.email ?? null,
              phone: o.customer.phone ?? null,
            }
          : null,
      };
    });
}

/**
 * Every order in the shop, oldest-relevant included, streamed page by page.
 * Used to work out which rep brought each client in: a customer's earliest POS
 * order names them. `since` limits the sweep to recent days for the incremental
 * cron pass; omit it for the full history backfill (~39 pages at 250/page).
 *
 * Streamed rather than returned whole so the caller folds each page into a
 * one-row-per-customer accumulator and memory stays flat over 2 years of orders.
 */
export async function* streamOrdersForAttribution(
  since?: string,
): AsyncGenerator<DayOrder[]> {
  let path: string | null =
    `/orders.json?status=any&limit=250&fields=${ORDER_LIST_FIELDS}` +
    (since ? `&created_at_min=${encodeURIComponent(since)}` : "");
  while (path) {
    const page: { body: { orders: RestDayOrder[] }; nextPageInfo: string | null } =
      await shopifyRest<{ orders: RestDayOrder[] }>(path);
    yield page.body.orders
      .filter((o) => !o.cancelled_at && !o.test)
      .map((o) => ({
        id: String(o.id),
        name: o.name ?? `#${o.id}`,
        createdAt: o.created_at,
        net: Number(o.current_subtotal_price ?? 0),
        currency: o.currency ?? null,
        sourceName: o.source_name ?? null,
        staffId: o.user_id != null ? String(o.user_id) : null,
        customer: o.customer
          ? { id: String(o.customer.id), createdAt: o.customer.created_at ?? null }
          : null,
      }));
    path = page.nextPageInfo
      ? `/orders.json?limit=250&fields=${ORDER_LIST_FIELDS}&page_info=${page.nextPageInfo}`
      : null;
  }
}

export type ShopifyCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
  ordersCount: number;
  totalSpent: number;
};

const CUSTOMER_FIELDS =
  "id,first_name,last_name,email,phone,created_at,orders_count,total_spent";

type RestCustomer = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  orders_count: number;
  total_spent: string;
};

const toCustomer = (c: RestCustomer): ShopifyCustomer => ({
  id: String(c.id),
  name: [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Customer",
  email: c.email ?? null,
  phone: c.phone ?? null,
  createdAt: c.created_at ?? null,
  ordersCount: c.orders_count,
  totalSpent: Number(c.total_spent),
});

/**
 * Full customer records for a set of ids — the clients view hydrates only the
 * page it's showing. Shopify caps `ids` at 250 per call.
 */
export async function fetchCustomersDetails(
  ids: string[],
): Promise<Map<string, ShopifyCustomer>> {
  const out = new Map<string, ShopifyCustomer>();
  for (let i = 0; i < ids.length; i += 250) {
    const chunk = ids.slice(i, i + 250);
    const { body } = await shopifyRest<{ customers: RestCustomer[] }>(
      `/customers.json?ids=${chunk.join(",")}&limit=250&fields=${CUSTOMER_FIELDS}`,
    );
    for (const c of body.customers) out.set(String(c.id), toCustomer(c));
  }
  return out;
}

/**
 * Shopify's own customer search — name, email or phone. Shopify owns client
 * identity and search; we only annotate the results with our attribution.
 */
export async function searchCustomers(
  query: string,
  limit = 50,
): Promise<ShopifyCustomer[]> {
  const { body } = await shopifyRest<{ customers: RestCustomer[] }>(
    `/customers/search.json?query=${encodeURIComponent(query)}&limit=${limit}&fields=${CUSTOMER_FIELDS}`,
  );
  return body.customers.map(toCustomer);
}

export type CustomerStats = { ordersCount: number; totalSpent: number };

/**
 * Shopify stats for a set of customer ids — the clients view's live
 * enrichment. Failures degrade to an empty map; the page must render from
 * our own data regardless.
 */
export async function fetchCustomersByIds(
  ids: string[],
): Promise<Map<string, CustomerStats>> {
  const out = new Map<string, CustomerStats>();
  for (let i = 0; i < ids.length; i += 250) {
    const chunk = ids.slice(i, i + 250);
    const { body } = await shopifyRest<{
      customers: { id: number; orders_count: number; total_spent: string }[];
    }>(
      `/customers.json?ids=${chunk.join(",")}&limit=250&fields=id,orders_count,total_spent`,
    );
    for (const c of body.customers) {
      out.set(String(c.id), {
        ordersCount: c.orders_count,
        totalSpent: Number(c.total_spent),
      });
    }
  }
  return out;
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

export type CatalogProduct = {
  id: string;
  title: string;
  productType: string | null;
  status: string;
  inventory: number | null;
  price: number | null;
  currency: string | null;
  image: string | null;
};

export type CatalogPage = {
  products: CatalogProduct[];
  hasNextPage: boolean;
  endCursor: string | null;
};

type CatalogData = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      title: string;
      productType: string | null;
      status: string;
      totalInventory: number | null;
      featuredMedia: { preview: { image: { url: string } | null } | null } | null;
      priceRangeV2: {
        minVariantPrice: { amount: string; currencyCode: string } | null;
      } | null;
    }[];
  };
};

/**
 * One page of the product catalog, cursor-paginated. The store has ~3,600
 * products, so this is never loaded whole — the admin page hydrates the page
 * it's showing.
 *
 * `search` and `productType` compose into Shopify's query syntax; the type is
 * quoted because values contain spaces ("BIKINI TOP").
 */
export async function fetchProductCatalog({
  search,
  productType,
  after,
  first = 40,
}: {
  search?: string;
  productType?: string;
  after?: string | null;
  first?: number;
} = {}): Promise<CatalogPage> {
  const clauses: string[] = [];
  const sanitized = (search ?? "").replace(/["\\()]/g, " ").trim();
  if (sanitized) clauses.push(`(title:*${sanitized}* OR sku:*${sanitized}*)`);
  if (productType) {
    clauses.push(`product_type:"${productType.replace(/"/g, "")}"`);
  }

  const data = await shopifyGraphql<CatalogData>(
    `query($first: Int!, $after: String, $q: String) {
      products(first: $first, after: $after, query: $q, sortKey: TITLE) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title
          productType
          status
          totalInventory
          featuredMedia { preview { image { url } } }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
        }
      }
    }`,
    { first, after: after ?? null, q: clauses.join(" AND ") || null },
  );

  return {
    products: data.products.nodes.map((p) => ({
      id: p.id.split("/").pop() ?? p.id,
      title: p.title,
      productType: p.productType || null,
      status: p.status,
      inventory: p.totalInventory,
      price: p.priceRangeV2?.minVariantPrice
        ? Number(p.priceRangeV2.minVariantPrice.amount)
        : null,
      currency: p.priceRangeV2?.minVariantPrice?.currencyCode ?? null,
      image: p.featuredMedia?.preview?.image?.url ?? null,
    })),
    hasNextPage: data.products.pageInfo.hasNextPage,
    endCursor: data.products.pageInfo.endCursor,
  };
}

/** The store's product types — the catalog's category filter. */
export async function fetchProductTypes(): Promise<string[]> {
  const data = await shopifyGraphql<{
    productTypes: { edges: { node: string }[] };
  }>(`query { productTypes(first: 250) { edges { node } } }`, {});
  return data.productTypes.edges.map((e) => e.node).filter(Boolean);
}

export type CustomerLineItem = {
  productId: string | null;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  price: number;
};

export type CustomerOrder = {
  id: string;
  name: string;
  createdAt: string;
  net: number;
  currency: string | null;
  items: CustomerLineItem[];
};

type RestCustomerOrder = {
  id: number;
  name: string | null;
  created_at: string;
  cancelled_at: string | null;
  test: boolean;
  current_subtotal_price: string;
  currency: string | null;
  line_items: {
    product_id: number | null;
    title: string | null;
    variant_title: string | null;
    sku: string | null;
    quantity: number;
    price: string;
  }[];
};

/**
 * One customer's orders, newest first, with the garments on each — what the
 * client profile shows. Shopify filters by customer server-side, so this is a
 * single call rather than a scan.
 */
export async function fetchCustomerOrders(
  customerId: string,
  limit = 50,
): Promise<CustomerOrder[]> {
  const fields =
    "id,name,created_at,cancelled_at,test,current_subtotal_price,currency,line_items";
  const { body } = await shopifyRest<{ orders: RestCustomerOrder[] }>(
    `/orders.json?status=any&customer_id=${encodeURIComponent(customerId)}` +
      `&limit=${limit}&fields=${fields}`,
  );
  return body.orders
    .filter((o) => !o.cancelled_at && !o.test)
    .map((o) => ({
      id: String(o.id),
      name: o.name ?? `#${o.id}`,
      createdAt: o.created_at,
      net: Number(o.current_subtotal_price ?? 0),
      currency: o.currency ?? null,
      items: (o.line_items ?? []).map((li) => ({
        productId: li.product_id != null ? String(li.product_id) : null,
        title: li.title ?? "Item",
        variantTitle: li.variant_title ?? null,
        sku: li.sku ?? null,
        quantity: li.quantity,
        price: Number(li.price ?? 0),
      })),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type ProductCard = {
  id: string;
  title: string;
  productType: string | null;
  image: string | null;
};

type ProductNodesData = {
  nodes: ({
    id: string;
    title: string;
    productType: string | null;
    featuredMedia: { preview: { image: { url: string } | null } | null } | null;
  } | null)[];
};

/**
 * Product cards (title, type, image) for a set of numeric product ids — the
 * images on a client's purchase history. Line items carry only ids, so this is
 * the second half of that lookup. Batched; deleted products come back null and
 * are skipped.
 */
export async function fetchProductsByIds(
  ids: string[],
): Promise<Map<string, ProductCard>> {
  const out = new Map<string, ProductCard>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const data = await shopifyGraphql<ProductNodesData>(
      `query($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            productType
            featuredMedia { preview { image { url } } }
          }
        }
      }`,
      { ids: chunk.map((id) => `gid://shopify/Product/${id}`) },
    );
    for (const node of data.nodes) {
      if (!node) continue;
      const numericId = node.id.split("/").pop() ?? node.id;
      out.set(numericId, {
        id: numericId,
        title: node.title,
        productType: node.productType || null,
        image: node.featuredMedia?.preview?.image?.url ?? null,
      });
    }
  }
  return out;
}

export type VariantHit = {
  barcode: string;
  sku: string | null;
  productTitle: string;
  productType: string | null; // Shopify productType, e.g. "LEGGING"
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
      product: { title: string; productType: string | null };
    }[];
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
  };
};

const variantHit = (v: VariantNodes["productVariants"]["nodes"][number]): VariantHit => ({
  barcode: v.barcode ?? "",
  sku: v.sku || null,
  productTitle: v.product.title,
  productType: v.product.productType || null,
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
        nodes { barcode sku title inventoryQuantity product { title productType } }
      }
    }`,
    { q: `barcode:${sanitized}` },
  );
  const v = data.productVariants.nodes[0];
  return v ? variantHit(v) : null;
}

/**
 * Resolve one SKU to its variant; null when not in the catalog. Receiving docs
 * often carry a SKU/style code but no barcode — this is the fallback match after
 * `lookupVariantByBarcode`. Returns the same shape (incl. barcode) so a matched
 * line still counts by barcode downstream.
 */
export async function lookupVariantBySku(sku: string): Promise<VariantHit | null> {
  const sanitized = sku.replace(/["\\()]/g, "").trim();
  if (!sanitized) return null;
  const data = await shopifyGraphql<VariantNodes>(
    `query($q: String!) {
      productVariants(first: 1, query: $q) {
        nodes { barcode sku title inventoryQuantity product { title productType } }
      }
    }`,
    { q: `sku:${sanitized}` },
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
          nodes { barcode sku title inventoryQuantity product { title productType } }
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

// Shopify throttles GraphQL by query cost; the push fetch's nested inventory
// levels are heavy enough to hit it on big catalogs.
async function withThrottleRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const throttled = err instanceof Error && err.message.includes("Throttled");
      if (!throttled || attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
}

export type ShopifyLocation = { id: string; name: string };

export async function fetchShopifyLocations(): Promise<ShopifyLocation[]> {
  const data = await shopifyGraphql<{
    locations: { nodes: { id: string; name: string }[] };
  }>(
    `query {
      locations(first: 10, includeInactive: false) {
        nodes { id name }
      }
    }`,
    {},
  );
  return data.locations.nodes;
}

/** The token's granted scopes, e.g. ["read_inventory", ...] — gates the push. */
export async function fetchAppAccessScopes(): Promise<string[]> {
  const data = await shopifyGraphql<{
    currentAppInstallation: { accessScopes: { handle: string }[] };
  }>(
    `query {
      currentAppInstallation {
        accessScopes { handle }
      }
    }`,
    {},
  );
  return data.currentAppInstallation.accessScopes.map((s) => s.handle);
}

export type PushVariant = {
  barcode: string;
  sku: string | null;
  productTitle: string;
  variantTitle: string | null;
  inventoryItemId: string;
  tracked: boolean;
  onHand: number | null; // at the given location; null = no inventory level there
};

type PushVariantNodes = {
  productVariants: {
    nodes: {
      barcode: string | null;
      sku: string | null;
      title: string | null;
      product: { title: string };
      inventoryItem: {
        id: string;
        tracked: boolean;
        inventoryLevel: {
          quantities: { name: string; quantity: number }[];
        } | null;
      };
    }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

/**
 * The whole catalog with each variant's inventory item id and CURRENT on_hand
 * at the store's Shopify location — what a push draft diffs the book against.
 * Smaller pages than fetchAllTrackedVariants: the nested level lookup roughly
 * triples per-node query cost.
 */
export async function fetchVariantsForPush(
  shopifyLocationId: string,
): Promise<PushVariant[]> {
  const all: PushVariant[] = [];
  let cursor: string | null = null;
  do {
    const data: PushVariantNodes = await withThrottleRetry(() =>
      shopifyGraphql<PushVariantNodes>(
        `query($after: String, $locationId: ID!) {
          productVariants(first: 150, after: $after) {
            nodes {
              barcode
              sku
              title
              product { title }
              inventoryItem {
                id
                tracked
                inventoryLevel(locationId: $locationId) {
                  quantities(names: ["on_hand"]) { name quantity }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { after: cursor, locationId: shopifyLocationId },
      ),
    );
    for (const v of data.productVariants.nodes) {
      if (!v.barcode) continue;
      const onHand = v.inventoryItem.inventoryLevel?.quantities.find(
        (q) => q.name === "on_hand",
      );
      all.push({
        barcode: v.barcode,
        sku: v.sku || null,
        productTitle: v.product.title,
        variantTitle: v.title || null,
        inventoryItemId: v.inventoryItem.id,
        tracked: v.inventoryItem.tracked,
        onHand: onHand ? onHand.quantity : null,
      });
    }
    const page = data.productVariants.pageInfo;
    cursor = page.hasNextPage ? (page.endCursor ?? null) : null;
  } while (cursor);
  return all;
}

export type SetOnHandItem = { inventoryItemId: string; quantity: number };
export type SetOnHandResult =
  | { ok: true }
  | { ok: false; message: string; failedIndexes: number[] };

/**
 * Write absolute on-hand quantities at one location (reason "correction").
 * Callers pre-chunk to <= 250 items. A userErrors response means the WHOLE
 * call wrote nothing — the mutation is atomic; failedIndexes point into the
 * passed items so the caller can name the offending rows.
 */
export async function setOnHandQuantities(
  shopifyLocationId: string,
  items: SetOnHandItem[],
  referenceDocumentUri: string,
): Promise<SetOnHandResult> {
  const data = await shopifyGraphql<{
    inventorySetOnHandQuantities: {
      userErrors: { field: string[] | null; message: string }[];
    };
  }>(
    `mutation($input: InventorySetOnHandQuantitiesInput!) {
      inventorySetOnHandQuantities(input: $input) {
        userErrors { field message }
      }
    }`,
    {
      input: {
        reason: "correction",
        referenceDocumentUri,
        setQuantities: items.map((i) => ({
          inventoryItemId: i.inventoryItemId,
          locationId: shopifyLocationId,
          quantity: i.quantity,
        })),
      },
    },
  );
  const errors = data.inventorySetOnHandQuantities.userErrors;
  if (!errors.length) return { ok: true };
  const failedIndexes = [
    ...new Set(
      errors
        .map((e) => Number(e.field?.[2]))
        .filter((n) => Number.isInteger(n) && n >= 0),
    ),
  ];
  return { ok: false, message: errors[0].message, failedIndexes };
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
