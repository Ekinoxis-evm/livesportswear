"use client";

import { useEffect, useRef } from "react";

/**
 * Reloads the always-on kiosk when a new deployment goes live.
 *
 * Without this, the iPad keeps running the JS bundle it was first served. After
 * a deploy that bundle's server-action IDs no longer exist on the current build,
 * so actions 404 at the framework layer before reaching our code — which is what
 * silently broke "send test report". Every feature that posts to the server has
 * the same failure mode until someone manually reloads.
 *
 * `served` is the deployment id baked into THIS render (from the server). The
 * poll hits /api/version, which — because skew protection is off — routes to the
 * CURRENT deployment. When the two differ, a new version is live: reload once,
 * but only while idle, so a reload never interrupts a rep mid-tap.
 */
export function VersionGuard({
  served,
  intervalMs = 90_000,
}: {
  served: string;
  intervalMs?: number;
}) {
  const reloading = useRef(false);

  useEffect(() => {
    // "dev" (no Vercel env) or an empty id means there's nothing to compare to.
    if (!served || served === "dev") return;

    const check = async () => {
      if (reloading.current || document.hidden) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version: string };
        if (version && version !== "dev" && version !== served) {
          reloading.current = true;
          window.location.reload();
        }
      } catch {
        // Offline or a transient error — try again next tick.
      }
    };

    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [served, intervalMs]);

  return null;
}
