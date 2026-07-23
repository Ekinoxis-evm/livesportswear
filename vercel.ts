import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  installCommand: "pnpm install --frozen-lockfile",

  // Daily syncs (each no-ops until its env keys are set). The Vercel plan
  // only allows once-daily crons, so the hourly intraday Shopify runs live
  // in .github/workflows/shopify-sync.yml.
  crons: [
    { path: "/api/cron/shopify-sync", schedule: "0 6 * * *" },
    { path: "/api/cron/meta-sync", schedule: "0 6 * * *" },
    { path: "/api/cron/photo-retention", schedule: "30 6 * * *" },
    // 06:45 UTC = deep night in Miami — closes the previous day's stragglers.
    { path: "/api/cron/stale-checkins", schedule: "45 6 * * *" },
  ],

  headers: [
    routes.header("/(.*)", [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        // camera=(self): the store kiosk takes check-in face photos.
        key: "Permissions-Policy",
        value: "camera=(self), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          // 'wasm-unsafe-eval': the inventory barcode reader (zxing, iOS Safari)
          // instantiates WebAssembly, which CSP3 blocks without it. It permits
          // ONLY WebAssembly, not arbitrary eval. The .wasm itself is served
          // same-origin from public/zxing/ (covered by connect-src 'self'),
          // never the package's jsdelivr CDN.
          "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https://*.supabase.co",
          "font-src 'self'",
          "connect-src 'self' https://*.supabase.co",
          "worker-src 'self' blob:",
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
