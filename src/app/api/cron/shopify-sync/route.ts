import { runShopifySync } from "@/lib/shopify-sync";

// Daily Vercel cron (see vercel.ts). Verifies CRON_SECRET, syncs the current
// month's sales from Shopify. No-ops cleanly if Shopify isn't configured yet.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const month = new Date().toISOString().slice(0, 7);
  const result = await runShopifySync(month);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
