import { runPhotoRetention } from "@/lib/photo-retention";

// Daily Vercel cron (see vercel.ts). Verifies CRON_SECRET, then deletes
// check-in face photos past the 30-day retention window.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runPhotoRetention();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
