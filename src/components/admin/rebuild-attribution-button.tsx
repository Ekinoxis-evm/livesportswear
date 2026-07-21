"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { rebuildClientAttribution } from "@/server/customer-origin";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RebuildAttributionButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  const rebuild = () =>
    start(async () => {
      const res = await rebuildClientAttribution();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { customers, unmappedStaff } = res.data ?? {
        customers: 0,
        unmappedStaff: [],
      };
      toast.success(
        `${customers.toLocaleString()} clients attributed.` +
          (unmappedStaff.length
            ? ` ${unmappedStaff.length} staff account${unmappedStaff.length === 1 ? "" : "s"} unmapped — link them on the employee pages.`
            : ""),
      );
      router.refresh();
    });

  return (
    <Button variant="outline" size="sm" onClick={rebuild} disabled={pending}>
      <Users className={cn("mr-1.5 size-4", pending && "animate-pulse")} />
      {pending ? "Rebuilding…" : "Rebuild attribution"}
    </Button>
  );
}
