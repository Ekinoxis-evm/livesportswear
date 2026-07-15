"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { syncMonthlySales } from "@/server/shopify";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncSalesButton({ label = "Sync sales now" }: { label?: string }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    const res = await syncMonthlySales();
    setSyncing(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      `Synced ${res.updated} employee${res.updated === 1 ? "" : "s"}` +
        (res.unmatched ? ` · ${res.unmatched} unmatched staff` : ""),
    );
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
      <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
      {syncing ? "Syncing…" : label}
    </Button>
  );
}
