"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitTimeOff } from "@/server/time-off";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TimeOffRequestForm({ token }: { token: string }) {
  const router = useRouter();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!start) {
      toast.error("Pick a start date.");
      return;
    }
    setPending(true);
    const res = await submitTimeOff({
      token,
      start_date: start,
      end_date: end || start,
      reason,
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Time-off request submitted.");
    setStart("");
    setEnd("");
    setReason("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Requests for a week are due by the Friday before it — schedules are
        released over the weekend.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="start">From</Label>
          <Input
            id="start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="end">To (optional)</Label>
          <Input
            id="end"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="reason">Reason (optional)</Label>
        <Input
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Doctor's appointment"
        />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Submitting…" : "Request time off"}
      </Button>
    </form>
  );
}
