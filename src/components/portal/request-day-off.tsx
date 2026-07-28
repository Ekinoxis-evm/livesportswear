"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarOff, Plus, X } from "lucide-react";
import { requestOwnDaysOff } from "@/server/time-off";
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

export function RequestDayOff() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<string[]>([""]);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function setDay(i: number, value: string) {
    setDays((d) => d.map((x, j) => (j === i ? value : x)));
  }
  function addDay() {
    setDays((d) => (d.length >= 7 ? d : [...d, ""]));
  }
  function removeDay(i: number) {
    setDays((d) => (d.length === 1 ? d : d.filter((_, j) => j !== i)));
  }

  function submit() {
    const dates = days.map((d) => d.trim()).filter(Boolean);
    if (dates.length === 0) {
      toast.error("Pick at least one day.");
      return;
    }
    startTransition(async () => {
      const res = await requestOwnDaysOff({ dates, reason });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't submit your request.");
        return;
      }
      toast.success(
        dates.length === 1 ? "Day-off request sent." : `${dates.length} days requested.`,
      );
      setOpen(false);
      setDays([""]);
      setReason("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <CalendarOff className="mr-1 size-4" /> Request days off
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request days off</DialogTitle>
          <DialogDescription>
            Add the specific days you want off (up to 7). Submit before the Friday
            before that week so it can be planned.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Days</Label>
            {days.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  type="date"
                  value={d}
                  onChange={(e) => setDay(i, e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove day"
                  disabled={days.length === 1}
                  onClick={() => removeDay(i)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            {days.length < 7 && (
              <Button variant="outline" size="sm" className="w-fit" onClick={addDay}>
                <Plus className="mr-1 size-4" /> Add another day
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="off-reason">Reason (optional)</Label>
            <Input
              id="off-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. family event"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button onClick={submit} disabled={pending}>
            {pending ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
