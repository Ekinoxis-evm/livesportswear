// The build id of whatever deployment serves this request. The kiosk polls it
// and reloads when the id it was served with no longer matches — so an
// always-on iPad picks up a new deploy instead of running stale JS whose
// server-action IDs 404 on the current build (which silently broke "send test").
//
// Uncached, and NOT skew-pinned: a plain fetch routes to the current production
// deployment, so a client on an old bundle sees the NEW id and reloads.
export const dynamic = "force-dynamic";

export function GET() {
  const version =
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "dev";
  return Response.json(
    { version },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
