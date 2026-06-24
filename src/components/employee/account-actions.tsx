"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  inviteEmployee,
  revokeEmployeeAccess,
} from "@/server/employee-accounts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function EmployeeAccessActions({
  id,
  linked,
}: {
  id: string;
  linked: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(
    action: Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) {
    setPending(true);
    const res = await action;
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Something went wrong.");
      return;
    }
    toast.success(okMsg);
    router.refresh();
  }

  if (linked) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="default">Portal access</Badge>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={pending}
          onClick={() => run(revokeEmployeeAccess(id), "Access revoked.")}
        >
          Revoke
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() => run(inviteEmployee(id), "Invite email sent.")}
    >
      Invite to portal
    </Button>
  );
}
