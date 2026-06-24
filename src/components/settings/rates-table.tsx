"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setHourlyRate } from "@/server/compensation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RatesTable({
  employees,
}: {
  employees: { id: string; name: string; rate: number | null }[];
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
            <Input
              type="number"
              step="0.01"
              min="0"
              value={vals[e.id] ?? ""}
              onChange={(ev) => setVals({ ...vals, [e.id]: ev.target.value })}
              className="w-32 tabular-nums"
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
