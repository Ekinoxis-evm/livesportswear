"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setCommissionConfig } from "@/server/commission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = { min_sales: string; ratePct: string };

export function CommissionConfigForm({
  currency,
  tiers,
}: {
  currency: string;
  tiers: { min_sales: number; rate: number }[];
}) {
  const router = useRouter();
  const [cur, setCur] = useState(currency);
  const [rows, setRows] = useState<Row[]>(
    tiers.map((t) => ({
      min_sales: String(t.min_sales),
      ratePct: String(t.rate * 100),
    })),
  );
  const [pending, setPending] = useState(false);

  function update(i: number, key: keyof Row, v: string) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [key]: v } : r)));
  }

  async function save() {
    setPending(true);
    const res = await setCommissionConfig({
      currency: cur,
      tiers: rows.map((r) => ({
        min_sales: r.min_sales,
        rate: Number(r.ratePct) / 100,
      })),
    });
    setPending(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Commission config saved.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="currency">Currency</Label>
        <Input
          id="currency"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
          className="w-24"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Tiers — sales at or above unlock the rate</Label>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Min sales"
              value={r.min_sales}
              onChange={(e) => update(i, "min_sales", e.target.value)}
            />
            <Input
              type="number"
              step="0.1"
              placeholder="Rate %"
              value={r.ratePct}
              onChange={(e) => update(i, "ratePct", e.target.value)}
              className="w-28"
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setRows([...rows, { min_sales: "", ratePct: "" }])}
        >
          Add tier
        </Button>
      </div>

      <Button onClick={save} disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save config"}
      </Button>
    </div>
  );
}
