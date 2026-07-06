"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { setEmployeePassword } from "@/server/employee-accounts";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/shared/copy-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SetPasswordButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [password, setPassword] = useState<string | null>(null);

  function generate() {
    start(async () => {
      const res = await setEmployeePassword(id);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't set the password.");
        return;
      }
      setPassword(res.data?.password ?? null);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setPassword(null);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <KeyRound className="mr-1 size-4" /> Set password
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set {name}&apos;s password</DialogTitle>
          <DialogDescription>
            Generates a temporary password, emails it to them, and keeps it
            visible on this page until they change it after signing in.
          </DialogDescription>
        </DialogHeader>

        {password ? (
          <div className="flex flex-col gap-3">
            <div className="bg-muted flex items-center justify-between gap-2 rounded-md border p-3">
              <code className="text-base font-semibold tracking-wide">{password}</code>
              <CopyButton value={password} label="Copy" />
            </div>
            <p className="text-muted-foreground text-xs">
              Give this to {name} along with their email, or let them use the
              email they just received. It stays visible on this page until they
              change it.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            This will {""}
            <strong>reset</strong> their current password if they already have one.
          </p>
        )}

        <DialogFooter>
          {password ? (
            <DialogClose render={<Button>Done</Button>} />
          ) : (
            <>
              <DialogClose render={<Button variant="outline">Cancel</Button>} />
              <Button onClick={generate} disabled={pending}>
                {pending ? "Generating…" : "Generate password"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
