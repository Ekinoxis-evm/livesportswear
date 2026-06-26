import "server-only";

// Add these in Vercel env once the shop admin grants Admin API access
// (scopes: read_orders, read_users; read_all_orders for history beyond 60 days).
export const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "";
export const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN ?? "";
export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

export function isShopifyConfigured(): boolean {
  return Boolean(SHOPIFY_STORE_DOMAIN && SHOPIFY_ADMIN_TOKEN);
}
