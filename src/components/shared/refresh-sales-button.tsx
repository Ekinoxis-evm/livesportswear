"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { refreshShareWeekSales } from "@/server/share-sales";
import { cn } from "@/lib/utils";

export function RefreshSalesButton({ token, week }: { token: string; week: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const refresh = () =>
    start(async () => {
      const res = await refreshShareWeekSales({ token, week });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data?.refreshed) toast.success("Sales updated.");
      else toast.info(`Just updated — try again in ${res.data?.retryInSeconds ?? 60}s.`);
      router.refresh();
    });

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={pending}
      aria-label="Update sales"
      className="text-muted-foreground hover:text-foreground rounded-md p-1 disabled:opacity-50"
    >
      <RefreshCw className={cn("size-4", pending && "animate-spin")} />
    </button>
  );
}
