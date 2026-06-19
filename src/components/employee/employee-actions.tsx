"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setEmployeeActive, rotateMagicToken } from "@/server/employees";
import { Button } from "@/components/ui/button";

export function EmployeeRowActions({
  id,
  active,
  token,
  appUrl,
}: {
  id: string;
  active: boolean;
  token: string;
  appUrl: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${appUrl}/s/${token}`);
      toast.success("Schedule link copied.");
    } catch {
      toast.error("Couldn't copy to clipboard.");
    }
  }

  async function rotate() {
    if (
      !confirm(
        "Rotate this employee's schedule link? Their old link stops working.",
      )
    )
      return;
    setPending(true);
    const res = await rotateMagicToken(id);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Schedule link rotated.");
    router.refresh();
  }

  async function toggleActive() {
    setPending(true);
    const res = await setEmployeeActive(id, !active);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(active ? "Employee deactivated." : "Employee activated.");
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={copyLink}>
        Copy link
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={rotate}
        disabled={pending}
        className="text-muted-foreground"
      >
        Rotate
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleActive}
        disabled={pending}
        className="text-muted-foreground"
      >
        {active ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}
