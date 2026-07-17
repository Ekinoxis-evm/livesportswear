"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { togglePushItem } from "@/server/inventory-push";

export function PushItemToggle({
  itemId,
  excluded,
  disabled,
}: {
  itemId: string;
  excluded: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [included, setIncluded] = useState(!excluded);
  const [, start] = useTransition();

  const toggle = (next: boolean) => {
    setIncluded(next);
    start(async () => {
      const res = await togglePushItem({ itemId, excluded: !next });
      if (!res.ok) {
        toast.error(res.error);
        setIncluded(!next);
        return;
      }
      router.refresh();
    });
  };

  return (
    <input
      type="checkbox"
      className="accent-primary size-4 cursor-pointer disabled:cursor-not-allowed"
      aria-label={included ? "Included in the push" : "Excluded from the push"}
      checked={included}
      disabled={disabled}
      onChange={(e) => toggle(e.target.checked)}
    />
  );
}
