"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { setStoreMonth } from "@/server/goals";
import type { CommissionTier } from "@/lib/commission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type Row = { min_sales: string; rate: string };
const toRows = (tiers: CommissionTier[]): Row[] =>
  tiers.map((t) => ({ min_sales: String(t.min_sales), rate: String(t.rate * 100) }));

export function StoreMonthForm({
  locations,
  year,
  month,
  goalsByLocation,
  tiersByKey,
  globalTiers,
  currency,
}: {
  locations: { id: string; name: string }[];
  year: number;
  month: number;
  goalsByLocation: Record<string, Record<number, number>>;
  tiersByKey: Record<string, CommissionTier[]>;
  globalTiers: CommissionTier[];
  currency: string;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [monthSel, setMonthSel] = useState(month);
  const [pending, setPending] = useState(false);

  const goalOf = (loc: string, m: number) =>
    goalsByLocation[loc]?.[m] != null ? String(goalsByLocation[loc][m]) : "";
  const tiersOf = (loc: string, m: number) => tiersByKey[`${loc}-${m}`];

  const [goal, setGoal] = useState(goalOf(locationId, monthSel));
  const [rows, setRows] = useState<Row[]>(toRows(tiersOf(locationId, monthSel) ?? globalTiers));
  const [inherited, setInherited] = useState(!tiersOf(locationId, monthSel));

  function load(loc: string, m: number) {
    setGoal(goalOf(loc, m));
    const t = tiersOf(loc, m);
    setRows(toRows(t ?? globalTiers));
    setInherited(!t);
  }

  function save() {
    setPending(true);
    const tiers = inherited
      ? []
      : rows
          .filter((r) => r.min_sales !== "" && r.rate !== "")
          .map((r) => ({ min_sales: Number(r.min_sales), rate: Number(r.rate) / 100 }));
    setStoreMonth({
      location_id: locationId,
      year,
      month: monthSel,
      goal_amount: goal === "" ? 0 : Number(goal),
      tiers,
    }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't save.");
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  if (locations.length === 0) {
    return <p className="text-muted-foreground text-sm">Add a location first.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 1. pick store + month */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-2">
          <Label>Store</Label>
          <Select
            items={Object.fromEntries(locations.map((l) => [l.id, l.name]))}
            value={locationId}
            onValueChange={(v) => {
              if (!v) return;
              setLocationId(v);
              load(v, monthSel);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Store" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Month ({year})</Label>
          <Select
            items={Object.fromEntries(MONTHS.map((m, i) => [String(i + 1), m]))}
            value={String(monthSel)}
            onValueChange={(v) => {
              if (!v) return;
              const m = Number(v);
              setMonthSel(m);
              load(locationId, m);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 2. goal for that store + month */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="goal">Sales goal</Label>
        <MoneyInput
          id="goal"
          currency={currency}
          value={goal}
          onValueChange={setGoal}
          className="w-48"
          placeholder="0"
        />
      </div>

      {/* 3. commission tiers for that store + month */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Commission tiers</Label>
          <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={inherited}
              onChange={(e) => {
                setInherited(e.target.checked);
                if (e.target.checked) setRows(toRows(globalTiers));
              }}
              className="size-3.5"
            />
            Use global default
          </label>
        </div>
        {!inherited &&
          rows.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Threshold</span>
                <MoneyInput
                  currency={currency}
                  value={r.min_sales}
                  onValueChange={(v) =>
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, min_sales: v } : x)))
                  }
                  className="w-36"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Rate %</span>
                <Input
                  inputMode="decimal"
                  value={r.rate}
                  onChange={(e) =>
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))
                  }
                  className="w-24"
                  placeholder="4"
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive mb-1"
                aria-label="Remove tier"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        {inherited ? (
          <p className="text-muted-foreground text-xs">
            This store/month uses the global default tiers. Untick to set custom rates.
          </p>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setRows((rs) => [...rs, { min_sales: "", rate: "" }])}
          >
            <Plus className="mr-1 size-4" /> Add tier
          </Button>
        )}
      </div>

      <div>
        <Button size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save goal & tiers"}
        </Button>
      </div>
    </div>
  );
}
