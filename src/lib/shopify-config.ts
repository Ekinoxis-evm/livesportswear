import "server-only";

// Add these in Vercel env. Auth is the client-credentials grant from a Dev
// Dashboard app installed on the store (scopes: read_orders + read_all_orders).
// SHOPIFY_ADMIN_TOKEN is a legacy override for a permanent custom-app token —
// used directly when set.
export const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "";
export const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID ?? "";
export const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET ?? "";
export const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN ?? "";
export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION ?? "2025-10";

export function isShopifyConfigured(): boolean {
  return Boolean(
    SHOPIFY_STORE_DOMAIN &&
      (SHOPIFY_ADMIN_TOKEN || (SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET)),
  );
}
