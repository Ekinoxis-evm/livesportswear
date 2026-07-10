import { closeStaleCheckins } from "@/lib/stale-checkins";

// Daily Vercel cron (see vercel.ts). Verifies CRON_SECRET, then closes
// check-ins that survived past their business day, flagged as missed.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await closeStaleCheckins();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
