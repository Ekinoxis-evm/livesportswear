"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { decideTimeOff } from "@/server/time-off";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function DecisionActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");

  async function decide(status: "approved" | "rejected", noteText: string) {
    setPending(true);
    const res = await decideTimeOff(id, { status, note: noteText });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(status === "approved" ? "Approved." : "Rejected.");
    setRejectOpen(false);
    setNote("");
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => decide("approved", "")}
      >
        Approve
      </Button>
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger
          render={
            <Button size="sm" variant="ghost" className="text-destructive">
              Reject
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject time-off request</DialogTitle>
            <DialogDescription>
              Add an optional note — it&apos;s included in the email to the
              employee.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 px-1">
            <Label htmlFor="note">Note</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Coverage already too thin that day"
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => decide("rejected", note)}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
