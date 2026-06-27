import { runMetaSyncForMonth } from "@/lib/meta-sync";

// Daily Vercel cron (see vercel.ts). Syncs the current month's Meta Ads
// insights. No-ops cleanly if Meta isn't configured yet.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const month = new Date().toISOString().slice(0, 7);
  const result = await runMetaSyncForMonth(month);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
