"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import type { ActionResult } from "@/server/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Refresh clients" — pulls recently-created Shopify customers into the store's
 * book (a bounded attribution + stats sync) so new people appear without
 * waiting for the 10-minute cron. The scoped action is passed in
 * (`storeRefreshClients` / `portalRefreshClients`).
 */
export function RefreshClientsButton({
  action,
  label = "Refresh clients",
}: {
  action: () => Promise<ActionResult<{ customers: number }>>;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const refresh = () =>
    start(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Up to date — ${(res.data?.customers ?? 0).toLocaleString()} clients checked.`,
      );
      router.refresh();
    });

  return (
    <Button variant="outline" size="sm" onClick={refresh} disabled={pending}>
      <UserPlus className={cn("size-4", pending && "animate-pulse")} />
      {pending ? "Refreshing…" : label}
    </Button>
  );
}
