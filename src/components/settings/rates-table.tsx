"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setHourlyRate } from "@/server/compensation";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";

export function RatesTable({
  employees,
  currency,
}: {
  employees: { id: string; name: string; rate: number | null }[];
  currency: string;
}) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(
      employees.map((e) => [e.id, e.rate != null ? String(e.rate) : ""]),
    ),
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  async function save(id: string) {
    setSavingId(id);
    const res = await setHourlyRate({
      employee_id: id,
      hourly_rate: vals[id] || "0",
    });
    setSavingId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Hourly rate saved.");
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-2">
      {employees.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-2">
          <span className="text-sm">{e.name}</span>
          <span className="flex items-center gap-2">
            <MoneyInput
              value={vals[e.id] ?? ""}
              onValueChange={(v) => setVals({ ...vals, [e.id]: v })}
              currency={currency}
              className="w-32"
              placeholder="0.00"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={savingId === e.id}
              onClick={() => save(e.id)}
            >
              Save
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}
