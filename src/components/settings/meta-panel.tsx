"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { syncAdInsights } from "@/server/meta";
import { Button } from "@/components/ui/button";

export function MetaPanel({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  if (!configured) {
    return (
      <div className="text-muted-foreground flex flex-col gap-2 text-sm">
        <p>
          Not connected yet. Add <code>META_ACCESS_TOKEN</code> and{" "}
          <code>META_AD_ACCOUNT_ID</code> in Vercel (a System User token with the{" "}
          <code>ads_read</code> scope), then redeploy. Spend &amp; ROAS then sync
          daily and show on the Marketing page.
        </p>
      </div>
    );
  }

  async function sync() {
    setSyncing(true);
    const res = await syncAdInsights();
    setSyncing(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      `Synced ${res.rows} campaign-day${res.rows === 1 ? "" : "s"}.`,
    );
    router.refresh();
  }

  return (
    <Button size="sm" onClick={sync} disabled={syncing}>
      {syncing ? "Syncing…" : "Sync this month"}
    </Button>
  );
}
