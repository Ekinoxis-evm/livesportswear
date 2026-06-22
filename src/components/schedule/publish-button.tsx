"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { publishSchedule } from "@/server/schedules";
import { Button } from "@/components/ui/button";
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

export function PublishButton({
  scheduleId,
  blockers,
  published,
}: {
  scheduleId: string;
  blockers: number;
  published: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function onPublish() {
    setPending(true);
    const res = await publishSchedule(scheduleId);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const sent = res.data?.sent ?? 0;
    const total = res.data?.total ?? sent;
    toast.success(`Schedule published — ${sent} of ${total} emails sent.`);
    setOpen(false);
    router.refresh();
  }

  if (blockers > 0) {
    return (
      <Button disabled variant="outline">
        Resolve {blockers} blocker{blockers === 1 ? "" : "s"} to publish
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button>{published ? "Re-publish" : "Publish"}</Button>}
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {published ? "Re-publish this schedule?" : "Publish this schedule?"}
          </DialogTitle>
          <DialogDescription>
            Each employee with shifts gets an email with their week and a
            calendar subscription link.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button onClick={onPublish} disabled={pending}>
            {pending ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
