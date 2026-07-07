import { runShopifySync } from "@/lib/shopify-sync";
import { businessDate } from "@/lib/business-date";
import { primaryTimezone } from "@/lib/business-tz";
import { previousMonth } from "@/lib/shopify-range";

// Daily Vercel cron (see vercel.ts). Verifies CRON_SECRET, then syncs the
// current AND previous month's sales — late orders and refunds after the
// month's last run would otherwise never land. No-ops cleanly if Shopify
// isn't configured yet.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const month = businessDate(await primaryTimezone()).slice(0, 7);
  const current = await runShopifySync(month);
  const previous = await runShopifySync(previousMonth(month));
  return Response.json(
    { current, previous },
    { status: current.ok && previous.ok ? 200 : 500 },
  );
}
