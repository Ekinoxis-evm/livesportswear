"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setPayPeriod } from "@/server/commission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PayPeriodForm({ anchor, cap }: { anchor: string; cap: number }) {
  const router = useRouter();
  const [anchorVal, setAnchorVal] = useState(anchor);
  const [capVal, setCapVal] = useState(String(cap));
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const res = await setPayPeriod({
      sprint_anchor_monday: anchorVal,
      biweekly_hour_cap: capVal,
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Pay period updated.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="pp-anchor">Sprint anchor (a Monday)</Label>
        <Input
          id="pp-anchor"
          type="date"
          value={anchorVal}
          onChange={(e) => setAnchorVal(e.target.value)}
          className="w-44"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="pp-cap">Biweekly hour cap</Label>
        <Input
          id="pp-cap"
          type="number"
          min={1}
          value={capVal}
          onChange={(e) => setCapVal(e.target.value)}
          className="w-32 tabular-nums"
        />
      </div>
      <Button size="sm" onClick={save} disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
