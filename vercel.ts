import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  installCommand: "pnpm install --frozen-lockfile",

  // Daily syncs (each no-ops until its env keys are set). The Vercel plan
  // only allows once-daily crons, so the intraday Shopify runs (every 3h
  // through the Miami store day) live in .github/workflows/shopify-sync.yml.
  crons: [
    { path: "/api/cron/shopify-sync", schedule: "0 6 * * *" },
    { path: "/api/cron/meta-sync", schedule: "0 6 * * *" },
  ],

  headers: [
    routes.header("/(.*)", [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          "font-src 'self'",
          "connect-src 'self' https://*.supabase.co",
          "frame-ancestors 'none'",
          "object-src 'none'",
          "base-uri 'none'",
        ].join("; "),
      },
    ]),
    routes.cacheControl("/s/(.*)\\.ics", {
      private: true,
      noCache: true,
      noStore: true,
    }),
  ],
};

export default config;
