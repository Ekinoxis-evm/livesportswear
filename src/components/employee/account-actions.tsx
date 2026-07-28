"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  inviteEmployee,
  revokeEmployeeAccess,
  type IssuedCredentials,
} from "@/server/employee-accounts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/shared/copy-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function EmployeeAccessActions({
  id,
  linked,
}: {
  id: string;
  linked: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

  async function revoke() {
    setPending(true);
    const res = await revokeEmployeeAccess(id);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Something went wrong.");
      return;
    }
    toast.success("Access revoked.");
    router.refresh();
  }

  async function invite() {
    setPending(true);
    const res = await inviteEmployee(id);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Something went wrong.");
      return;
    }
    setIssued(res.data ?? null);
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
          onClick={revoke}
        >
          Revoke
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button size="sm" disabled={pending} onClick={invite}>
        Invite to portal
      </Button>
      <Dialog open={Boolean(issued)} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Portal access created</DialogTitle>
            <DialogDescription>
              {issued?.emailed
                ? `The credentials were emailed to ${issued.email}. You can also hand them over directly:`
                : `The email couldn't be sent — hand these over directly (also kept on this page until they change it):`}
            </DialogDescription>
          </DialogHeader>
          {issued && (
            <div className="bg-muted flex items-center justify-between gap-2 rounded-md border p-3">
              <code className="text-base font-semibold tracking-wide">
                {issued.password}
              </code>
              <CopyButton value={issued.password} label="Copy" />
            </div>
          )}
          <DialogFooter>
            <DialogClose render={<Button>Done</Button>} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
