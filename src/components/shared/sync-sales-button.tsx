"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SyncOutcome =
  | { ok: true; updated: number; unmatched: number }
  | { ok: false; error: string };

/**
 * "Sync sales now" — pulls this month's Shopify sales into `monthly_sales` so
 * the rankings/tiers update on demand. The scoped server action is passed in
 * (`storeSyncSales` / `portalSyncSales` / `syncMonthlySales`) so one button
 * serves the kiosk, portal and admin.
 */
export function SyncSalesButton({
  action,
  label = "Sync sales",
}: {
  action: () => Promise<SyncOutcome>;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const sync = () =>
    start(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Synced ${res.updated} employee${res.updated === 1 ? "" : "s"}` +
          (res.unmatched ? ` · ${res.unmatched} unmatched staff` : ""),
      );
      router.refresh();
    });

  return (
    <Button variant="outline" size="sm" onClick={sync} disabled={pending}>
      <RefreshCw className={cn("size-4", pending && "animate-spin")} />
      {pending ? "Syncing…" : label}
    </Button>
  );
}
