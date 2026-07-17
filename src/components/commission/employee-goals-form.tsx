"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setEmployeeGoals } from "@/server/employee-goals";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** goalsByEmployee[employeeId][`${year}-${month}`] = amount */
export type EmployeeGoalsByKey = Record<string, Record<string, number>>;

export function EmployeeGoalsForm({
  employees,
  year,
  month,
  goalsByEmployee,
  currency,
}: {
  employees: { id: string; name: string }[];
  year: number;
  month: number;
  goalsByEmployee: EmployeeGoalsByKey;
  currency: string;
}) {
  const router = useRouter();
  const [yearSel, setYearSel] = useState(year);
  const [monthSel, setMonthSel] = useState(month);
  const [pending, setPending] = useState(false);
  const years = [year, year + 1];

  const valuesFor = (y: number, m: number): Record<string, string> =>
    Object.fromEntries(
      employees.map((e) => {
        const v = goalsByEmployee[e.id]?.[`${y}-${m}`];
        return [e.id, v != null && v > 0 ? String(v) : ""];
      }),
    );

  const [values, setValues] = useState<Record<string, string>>(
    valuesFor(year, month),
  );

  function load(y: number, m: number) {
    setValues(valuesFor(y, m));
  }

  function save() {
    setPending(true);
    setEmployeeGoals({
      year: yearSel,
      month: monthSel,
      entries: employees.map((e) => ({
        employee_id: e.id,
        goal_amount: values[e.id] === "" ? 0 : Number(values[e.id]),
      })),
    }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Personal goals saved.");
      router.refresh();
    });
  }

  if (employees.length === 0) {
    return <p className="text-muted-foreground text-sm">No active employees.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-2">
          <Label>Month</Label>
          <Select
            items={Object.fromEntries(MONTHS.map((m, i) => [String(i + 1), m]))}
            value={String(monthSel)}
            onValueChange={(v) => {
              if (!v) return;
              const m = Number(v);
              setMonthSel(m);
              load(yearSel, m);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Year</Label>
          <Select
            items={Object.fromEntries(years.map((y) => [String(y), String(y)]))}
            value={String(yearSel)}
            onValueChange={(v) => {
              if (!v) return;
              const y = Number(v);
              setYearSel(y);
              load(y, monthSel);
            }}
          >
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {employees.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3">
            <span className="text-sm">{e.name}</span>
            <MoneyInput
              currency={currency}
              value={values[e.id] ?? ""}
              onValueChange={(v) => setValues((vals) => ({ ...vals, [e.id]: v }))}
              className="w-36"
              placeholder="none"
            />
          </div>
        ))}
      </div>

      <div>
        <Button size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save personal goals"}
        </Button>
      </div>
    </div>
  );
}
