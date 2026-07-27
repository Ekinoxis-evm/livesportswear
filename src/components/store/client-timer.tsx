"use client";

import { useSyncExternalStore } from "react";
import { Clock } from "lucide-react";

function subscribeSecondTick(onTick: () => void) {
  const t = setInterval(onTick, 1000);
  return () => clearInterval(t);
}

// Floored to the second so the snapshot is stable between ticks.
function nowSnapshot() {
  return Math.floor(Date.now() / 1000) * 1000;
}

/**
 * Live elapsed clock for the client a rep is attending — counts up from when
 * the client was taken (mm:ss, or h:mm:ss past an hour). Mirrors BreakTimer:
 * recomputes from `startedAt` each tick (no drift), the 45s kiosk refresh
 * re-anchors, and it shows --:-- until mounted to avoid a hydration mismatch.
 */
export function ClientTimer({ startedAt }: { startedAt: string /* ISO */ }) {
  const now = useSyncExternalStore(subscribeSecondTick, nowSnapshot, () => null);

  if (now === null) {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 tabular-nums">
        <Clock className="size-3.5" /> --:--
      </span>
    );
  }

  const secs = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const label =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Clock className="size-3.5" /> {label}
    </span>
  );
}
