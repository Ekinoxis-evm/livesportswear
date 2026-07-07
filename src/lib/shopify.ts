import "server-only";
import {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,
  SHOPIFY_ADMIN_TOKEN,
  SHOPIFY_API_VERSION,
} from "@/lib/shopify-config";
import { ordersSearchQuery } from "@/lib/shopify-range";

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

async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const call = async (token: string) =>
    fetch(
      `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
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
  const json = (await res.json()) as {
    data?: T;
    errors?: unknown;
  };
  if (json.errors) {
    throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }
  return json.data as T;
}

export type ShopifyStaff = { id: string; name: string; email: string | null };

/** All staff members (for mapping each to an employee). */
export async function listStaffMembers(): Promise<ShopifyStaff[]> {
  const data = await shopifyGraphQL<{
    staffMembers: { nodes: ShopifyStaff[] };
  }>(`
    query StaffMembers {
      staffMembers(first: 100) {
        nodes { id name email }
      }
    }
  `);
  return data.staffMembers.nodes;
}

type OrdersPage = {
  orders: {
    edges: {
      node: {
        staffMember: { id: string } | null;
        currentTotalPriceSet: { shopMoney: { amount: string } };
      };
    }[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

/**
 * Total sales per Shopify staff member for [start, endExclusive) — UTC ISO
 * instants (callers pass store-local month boundaries). Cancelled orders are
 * excluded; orders are attributed via Order.staffMember (POS staff). Paginates fully.
 */
export async function fetchSalesByStaff(
  start: string,
  endExclusive: string,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  let after: string | null = null;

  do {
    const data: OrdersPage = await shopifyGraphQL<OrdersPage>(
      `query Orders($q: String!, $after: String) {
        orders(first: 250, after: $after, query: $q, sortKey: CREATED_AT) {
          edges {
            node {
              staffMember { id }
              currentTotalPriceSet { shopMoney { amount } }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { q: ordersSearchQuery(start, endExclusive), after },
    );

    for (const edge of data.orders.edges) {
      const staffId = edge.node.staffMember?.id;
      if (!staffId) continue; // only attributed (POS) orders
      const amount = Number(edge.node.currentTotalPriceSet.shopMoney.amount) || 0;
      totals.set(staffId, (totals.get(staffId) ?? 0) + amount);
    }
    after = data.orders.pageInfo.hasNextPage
      ? data.orders.pageInfo.endCursor
      : null;
  } while (after);

  return totals;
}
