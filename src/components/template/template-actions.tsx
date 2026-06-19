"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setTemplateActive } from "@/server/templates";
import { Button } from "@/components/ui/button";

export function TemplateActiveToggle({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const res = await setTemplateActive(id, !active);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(active ? "Template deactivated." : "Template activated.");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={toggle}
      className="text-muted-foreground"
    >
      {active ? "Deactivate" : "Activate"}
    </Button>
  );
}
