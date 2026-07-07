import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  installCommand: "pnpm install --frozen-lockfile",

  // Syncs (each no-ops until its env keys are set). Shopify runs through the
  // store day — every 3h from 9:30 to 21:30 plus the 22:30 close, Miami time
  // (EDT, UTC-4): 13:30/16:30/19:30/22:30/01:30/02:30 UTC. Vercel cron is UTC,
  // so in winter (EST) the local times shift one hour later.
  crons: [
    { path: "/api/cron/shopify-sync", schedule: "30 1,2,13,16,19,22 * * *" },
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
