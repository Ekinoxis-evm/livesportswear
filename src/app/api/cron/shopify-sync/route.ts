import { runShopifySync } from "@/lib/shopify-sync";
import { runAttributionSync } from "@/lib/customer-origin-sync";
import { businessDate } from "@/lib/business-date";
import { primaryTimezone } from "@/lib/business-tz";
import { previousMonth } from "@/lib/shopify-range";
import { finalizeEndedContests } from "@/server/rewards-data";

// How far back the attribution pass looks. Only new customers matter here, and
// the upsert never overwrites an earlier first order, so a short window is
// enough — the full history comes from the admin rebuild action.
const ATTRIBUTION_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

// Daily Vercel cron (see vercel.ts). Verifies CRON_SECRET, then syncs the
// current AND previous month's sales — late orders and refunds after the
// month's last run would otherwise never land. Also attributes newly seen
// clients to the rep on their first order, and snapshots any sales contest
// whose end date has passed. No-ops cleanly if Shopify isn't configured yet.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const month = businessDate(await primaryTimezone()).slice(0, 7);
  const current = await runShopifySync(month);
  const previous = await runShopifySync(previousMonth(month));
  const attribution = await runAttributionSync(
    new Date(Date.now() - ATTRIBUTION_LOOKBACK_MS).toISOString(),
  );
  const contests = await finalizeEndedContests();
  return Response.json(
    { current, previous, attribution, contests },
    { status: current.ok && previous.ok ? 200 : 500 },
  );
}
