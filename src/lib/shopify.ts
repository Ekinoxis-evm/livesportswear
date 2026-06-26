import "server-only";
import {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ADMIN_TOKEN,
  SHOPIFY_API_VERSION,
} from "@/lib/shopify-config";

async function shopifyGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
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
 * Total sales per Shopify staff member for [start, endExclusive).
 * Orders are attributed via Order.staffMember (POS staff). Paginates fully.
 */
export async function fetchSalesByStaff(
  startDate: string, // YYYY-MM-DD inclusive
  endExclusive: string, // YYYY-MM-DD exclusive
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
      { q: `created_at:>=${startDate} created_at:<${endExclusive}`, after },
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
