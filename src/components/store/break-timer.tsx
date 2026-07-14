"use client";

import { useSyncExternalStore } from "react";
import { BREAK_BUDGET_MINUTES } from "@/lib/breaks";
import { cn } from "@/lib/utils";

function subscribeSecondTick(onTick: () => void) {
  const t = setInterval(onTick, 1000);
  return () => clearInterval(t);
}

// Floored to the second so the snapshot is stable between ticks.
function nowSnapshot() {
  return Math.floor(Date.now() / 1000) * 1000;
}

/**
 * Live elapsed clock for an open break. Each tick recomputes from startedAt
 * (no accumulated drift); the 45s kiosk refresh re-anchors the props. Shows
 * --:-- until mounted so the server render can't cause a hydration mismatch.
 */
export function BreakTimer({
  startedAt,
  priorMinutes,
}: {
  startedAt: string; // ISO
  priorMinutes: number; // closed breaks earlier today
}) {
  const now = useSyncExternalStore(subscribeSecondTick, nowSnapshot, () => null);

  if (now === null) {
    return <span className="text-muted-foreground tabular-nums">--:--</span>;
  }

  const elapsedMs = Math.max(0, now - Date.parse(startedAt));
  const mm = Math.floor(elapsedMs / 60000);
  const ss = Math.floor((elapsedMs % 60000) / 1000);
  const totalMinutes = priorMinutes + Math.floor(elapsedMs / 60000);
  const over = totalMinutes > BREAK_BUDGET_MINUTES;

  return (
    <span className={cn("tabular-nums", over ? "text-destructive font-semibold" : "")}>
      {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
      <span className={cn("ml-2 text-xs", over ? "" : "text-muted-foreground")}>
        {totalMinutes}/{BREAK_BUDGET_MINUTES}m today{over && " — over"}
      </span>
    </span>
  );
}
