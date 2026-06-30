"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setEmployeeAdmin } from "@/server/employee-accounts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AdminRoleActions({
  id,
  isAdmin,
}: {
  id: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle(makeAdmin: boolean, okMsg: string) {
    setPending(true);
    const res = await setEmployeeAdmin(id, makeAdmin);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Something went wrong.");
      return;
    }
    toast.success(okMsg);
    router.refresh();
  }

  if (isAdmin) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="default">Admin</Badge>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={pending}
          onClick={() => toggle(false, "Admin access removed.")}
        >
          Remove admin
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => toggle(true, "Promoted to admin.")}
    >
      Make admin
    </Button>
  );
}
