"use client";

import { Plus, Trash2 } from "lucide-react";
import { GARMENT_KINDS, type GarmentKind, type PrizeItem } from "@/lib/rewards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ItemDraft = {
  type: PrizeItem["type"];
  amount: string;
  garments: GarmentKind[];
  qty: string;
  label: string;
  requires_goal: boolean;
  requires_personal: boolean;
};

export const emptyItemDraft = (): ItemDraft => ({
  type: "clothing",
  amount: "",
  garments: [],
  qty: "1",
  label: "",
  requires_goal: false,
  requires_personal: false,
});

export function toItemDrafts(items: PrizeItem[]): ItemDraft[] {
  return items.map((i) => ({
    type: i.type,
    amount: i.type === "cash" ? String(i.amount) : "",
    garments: i.type === "clothing" ? i.garments : [],
    qty: i.type === "clothing" ? String(i.qty) : "1",
    label: i.type === "other" ? i.label : "",
    requires_goal: i.requires_goal,
    requires_personal: i.requires_personal,
  }));
}

/** Drafts → payload items; incomplete drafts pass through for the server to reject with a message. */
export function fromItemDrafts(drafts: ItemDraft[]): unknown[] {
  return drafts.map((d) => {
    const conditions = {
      requires_goal: d.requires_goal,
      requires_personal: d.requires_personal,
    };
    if (d.type === "cash") {
      return { type: "cash", amount: Number(d.amount), ...conditions };
    }
    if (d.type === "clothing") {
      return {
        type: "clothing",
        garments: d.garments,
        qty: Number(d.qty) || 1,
        ...conditions,
      };
    }
    return { type: "other", label: d.label, ...conditions };
  });
}

const TYPE_LABELS: Record<PrizeItem["type"], string> = {
  clothing: "Clothing",
  cash: "Cash",
  other: "Other",
};

export function PrizeItemsEditor({
  items,
  onChange,
  currency,
}: {
  items: ItemDraft[];
  onChange: (items: ItemDraft[]) => void;
  currency: string;
}) {
  const patch = (i: number, p: Partial<ItemDraft>) =>
    onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Select
              items={TYPE_LABELS}
              value={item.type}
              onValueChange={(v) => v && patch(i, { type: v as PrizeItem["type"] })}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as PrizeItem["type"][]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {item.type === "cash" && (
              <MoneyInput
                currency={currency}
                value={item.amount}
                onValueChange={(v) => patch(i, { amount: v })}
                className="w-32"
                placeholder="200"
              />
            )}
            {item.type === "clothing" && (
              <Input
                inputMode="numeric"
                value={item.qty}
                onChange={(e) => patch(i, { qty: e.target.value })}
                className="w-16"
                aria-label="Quantity"
              />
            )}
            {item.type === "other" && (
              <Input
                value={item.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                className="flex-1"
                placeholder="Free day off"
              />
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive ml-auto"
              aria-label="Remove prize item"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          {item.type === "clothing" && (
            <div className="flex flex-wrap gap-1.5">
              {GARMENT_KINDS.map((g) => {
                const on = item.garments.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() =>
                      patch(i, {
                        garments: on
                          ? item.garments.filter((x) => x !== g)
                          : [...item.garments, g],
                      })
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <label className="text-muted-foreground flex w-fit items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={item.requires_goal}
                onChange={(e) => patch(i, { requires_goal: e.target.checked })}
                className="size-3.5"
              />
              Only if the store reaches its goal
            </label>
            <label className="text-muted-foreground flex w-fit items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={item.requires_personal}
                onChange={(e) => patch(i, { requires_personal: e.target.checked })}
                className="size-3.5"
              />
              Only if they beat their personal goal
            </label>
          </div>
        </div>
      ))}
      {items.length < 8 && (
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => onChange([...items, emptyItemDraft()])}
        >
          <Plus className="mr-1 size-4" /> Add prize item
        </Button>
      )}
    </div>
  );
}
