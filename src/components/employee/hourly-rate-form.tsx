"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setHourlyRate } from "@/server/compensation";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";

export function HourlyRateForm({
  employeeId,
  rate,
  currency = "USD",
}: {
  employeeId: string;
  rate: number | null;
  currency?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(rate != null ? String(rate) : "");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const res = await setHourlyRate({
      employee_id: employeeId,
      hourly_rate: value,
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Hourly rate saved.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="rate">Hourly rate</Label>
        <MoneyInput
          id="rate"
          value={value}
          onValueChange={setValue}
          currency={currency}
          className="w-36"
          placeholder="0.00"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
