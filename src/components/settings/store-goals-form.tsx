"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setStoreGoals } from "@/server/goals";
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
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type GoalsByLocation = Record<string, Record<number, number>>;

export function StoreGoalsForm({
  locations,
  year,
  goalsByLocation,
  currency,
}: {
  locations: { id: string; name: string }[];
  year: number;
  goalsByLocation: GoalsByLocation;
  currency: string;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [pending, setPending] = useState(false);

  const initialFor = (loc: string): Record<number, string> => {
    const g = goalsByLocation[loc] ?? {};
    const out: Record<number, string> = {};
    for (let m = 1; m <= 12; m++) out[m] = g[m] != null ? String(g[m]) : "";
    return out;
  };

  const [amounts, setAmounts] = useState<Record<number, string>>(
    initialFor(locations[0]?.id ?? ""),
  );

  function selectLocation(id: string) {
    setLocationId(id);
    setAmounts(initialFor(id));
  }

  async function save() {
    setPending(true);
    const goals = Object.entries(amounts)
      .filter(([, v]) => v !== "")
      .map(([month, v]) => ({ month: Number(month), goal_amount: Number(v) }));
    const res = await setStoreGoals({ location_id: locationId, year, currency, goals });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't save goals.");
      return;
    }
    toast.success("Goals saved.");
    router.refresh();
  }

  if (locations.length === 0) {
    return <p className="text-muted-foreground text-sm">Add a location first.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Label>Store</Label>
          <Select
            items={Object.fromEntries(locations.map((l) => [l.id, l.name]))}
            value={locationId}
            onValueChange={(v) => v && selectLocation(v)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select store" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-muted-foreground text-sm tabular-nums">{year}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {MONTHS.map((label, i) => {
          const m = i + 1;
          return (
            <div key={m} className="flex flex-col gap-1">
              <Label htmlFor={`goal-${m}`} className="text-xs">
                {label}
              </Label>
              <MoneyInput
                id={`goal-${m}`}
                currency={currency}
                value={amounts[m] ?? ""}
                onValueChange={(v) => setAmounts((a) => ({ ...a, [m]: v }))}
                placeholder="0"
              />
            </div>
          );
        })}
      </div>

      <div>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save goals"}
        </Button>
      </div>
    </div>
  );
}
