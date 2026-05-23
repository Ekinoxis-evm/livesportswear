import { routes, type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  installCommand: "pnpm install --frozen-lockfile",

  crons: [
    {
      path: "/api/cron/shift-reminders",
      schedule: "0 18 * * *",
    },
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
    ]),
    routes.cacheControl("/s/(.*)\\.ics", {
      private: true,
      noCache: true,
      noStore: true,
    }),
  ],
};

export default config;
