"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListChecks } from "lucide-react";
import { buildPushDraft } from "@/server/inventory-push";
import { Button } from "@/components/ui/button";

export function BuildPushDraftButton({ locationId }: { locationId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const build = () =>
    start(async () => {
      const res = await buildPushDraft({ locationId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.data?.corrections
          ? `Draft ready — ${res.data.corrections} corrections to review.`
          : "Draft ready — the book already matches Shopify.",
      );
      router.refresh();
    });

  return (
    <Button onClick={build} disabled={pending}>
      <ListChecks className="mr-1.5 size-4" />
      {pending ? "Comparing against Shopify…" : "Build draft"}
    </Button>
  );
}
