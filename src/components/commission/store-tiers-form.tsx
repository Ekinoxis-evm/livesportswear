"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { setStoreTiers } from "@/server/goals";
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
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type Row = { min_sales: string; rate: string }; // rate as percent string

const toRows = (tiers: CommissionTier[]): Row[] =>
  tiers.map((t) => ({ min_sales: String(t.min_sales), rate: String(t.rate * 100) }));

export function StoreTiersForm({
  locations,
  year,
  month,
  tiersByKey,
  globalTiers,
  currency,
}: {
  locations: { id: string; name: string }[];
  year: number;
  month: number;
  tiersByKey: Record<string, CommissionTier[]>;
  globalTiers: CommissionTier[];
  currency: string;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [monthSel, setMonthSel] = useState(month);
  const [pending, setPending] = useState(false);

  const key = (loc: string, m: number) => `${loc}-${m}`;
  const custom = tiersByKey[key(locationId, monthSel)];
  const [rows, setRows] = useState<Row[]>(toRows(custom ?? globalTiers));
  const [inherited, setInherited] = useState(!custom);

  function load(loc: string, m: number) {
    const c = tiersByKey[key(loc, m)];
    setRows(toRows(c ?? globalTiers));
    setInherited(!c);
  }

  function save(clear = false) {
    setPending(true);
    const tiers = clear
      ? []
      : rows
          .filter((r) => r.min_sales !== "" && r.rate !== "")
          .map((r) => ({ min_sales: Number(r.min_sales), rate: Number(r.rate) / 100 }));
    setStoreTiers({ location_id: locationId, year, month: monthSel, tiers }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't save tiers.");
        return;
      }
      toast.success(clear ? "Reset to global default." : "Store tiers saved.");
      setInherited(clear);
      router.refresh();
    });
  }

  if (locations.length === 0) {
    return <p className="text-muted-foreground text-sm">Add a location first.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
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
            <SelectTrigger className="w-32">
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

      {inherited && (
        <p className="text-muted-foreground text-xs">
          Using the global default tiers for this store/month. Edit and save to
          override just this month.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Min sales</Label>
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
              <Label className="text-xs">Rate %</Label>
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
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setRows((rs) => [...rs, { min_sales: "", rate: "" }])}
        >
          <Plus className="mr-1 size-4" /> Add tier
        </Button>
      </div>

      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => save(false)}>
          {pending ? "Saving…" : "Save store tiers"}
        </Button>
        {!inherited && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => save(true)}>
            Reset to global
          </Button>
        )}
      </div>
    </div>
  );
}
