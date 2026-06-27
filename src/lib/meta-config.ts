import "server-only";

// Add these in Vercel env once you create a Meta System User token (scope:
// ads_read) in Business Manager. META_AD_ACCOUNT_ID may include the act_ prefix
// or not. Bump META_API_VERSION if Meta deprecates the default.
export const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN ?? "";
export const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID ?? "";
export const META_API_VERSION = process.env.META_API_VERSION ?? "v21.0";

export function isMetaConfigured(): boolean {
  return Boolean(META_ACCESS_TOKEN && META_AD_ACCOUNT_ID);
}
