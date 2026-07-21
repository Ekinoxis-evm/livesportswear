"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Keeps the always-on kiosk current without realtime infra. */
export function AutoRefresh({ seconds = 45 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      // Don't churn a re-render while the screen is backgrounded (a hidden
      // iPad) — refresh on the next tick once it's visible again.
      if (!document.hidden) router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
