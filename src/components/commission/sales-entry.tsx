"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setMonthlySales } from "@/server/commission";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";

export function SalesEntry({
  month,
  employees,
  currency,
}: {
  month: string;
  employees: { id: string; name: string; amount: number }[];
  currency: string;
}) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>(
    Object.fromEntries(employees.map((e) => [e.id, String(e.amount)])),
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  async function save(id: string) {
    setSavingId(id);
    const res = await setMonthlySales({
      employee_id: id,
      month,
      amount: amounts[id] || "0",
    });
    setSavingId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Sales saved.");
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-2">
      {employees.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-2">
          <span className="text-sm">{e.name}</span>
          <span className="flex items-center gap-2">
            <MoneyInput
              value={amounts[e.id] ?? ""}
              onValueChange={(v) => setAmounts({ ...amounts, [e.id]: v })}
              currency={currency}
              className="w-40"
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
