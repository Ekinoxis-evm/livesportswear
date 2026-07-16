"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createContest, updateContest } from "@/server/rewards";
import type { ContestPrize } from "@/lib/rewards";
import {
  PrizeItemsEditor,
  emptyItemDraft,
  fromItemDrafts,
  toItemDrafts,
  type ItemDraft,
} from "@/components/rewards/prize-items-editor";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const PLACE_LABELS = ["1st", "2nd", "3rd"];
const placeLabel = (i: number) => PLACE_LABELS[i] ?? `${i + 1}th`;

type PrizeRow = { min_sales: string; items: ItemDraft[] };

export type ContestFormValues = {
  id: string;
  location_id: string;
  name: string;
  start_date: string;
  end_date: string;
  store_threshold: number;
  prizes: ContestPrize[];
};

export function ContestFormSheet({
  locations,
  currency,
  contest,
  children,
}: {
  locations: { id: string; name: string }[];
  currency: string;
  contest?: ContestFormValues; // set = edit mode
  children: ReactElement;
}) {
  const router = useRouter();
  const isEdit = Boolean(contest);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const [locationId, setLocationId] = useState(contest?.location_id ?? locations[0]?.id ?? "");
  const [name, setName] = useState(contest?.name ?? "");
  const [startDate, setStartDate] = useState(contest?.start_date ?? "");
  const [endDate, setEndDate] = useState(contest?.end_date ?? "");
  const [threshold, setThreshold] = useState(
    contest ? String(contest.store_threshold) : "",
  );
  const [rows, setRows] = useState<PrizeRow[]>(
    contest?.prizes.map((p) => ({
      min_sales: p.min_sales === null ? "" : String(p.min_sales),
      items: toItemDrafts(p.items),
    })) ?? [{ min_sales: "", items: [emptyItemDraft()] }],
  );

  function save() {
    setPending(true);
    const payload = {
      ...(isEdit ? { id: contest!.id } : {}),
      location_id: locationId,
      name,
      start_date: startDate,
      end_date: endDate,
      store_threshold: threshold === "" ? 0 : Number(threshold),
      prizes: rows.map((r) => ({
        min_sales: r.min_sales === "" ? null : Number(r.min_sales),
        items: fromItemDrafts(r.items),
      })),
    };
    (isEdit ? updateContest(payload) : createContest(payload)).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "Contest updated." : "Contest created.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={children} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit contest" : "New contest"}</SheetTitle>
          <SheetDescription>
            Prizes only pay out once the store goal is reached.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
          <div className="flex flex-col gap-2">
            <Label>Store</Label>
            <Select
              items={Object.fromEntries(locations.map((l) => [l.id, l.name]))}
              value={locationId}
              onValueChange={(v) => v && setLocationId(v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Store" />
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="contest-name">Name</Label>
            <Input
              id="contest-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="July sales push"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="contest-start">Starts</Label>
              <Input
                id="contest-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="contest-end">Ends</Label>
              <Input
                id="contest-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contest-threshold">Store sales goal (gate)</Label>
            <MoneyInput
              id="contest-threshold"
              currency={currency}
              value={threshold}
              onValueChange={setThreshold}
              placeholder="0"
            />
            <p className="text-muted-foreground text-xs">
              Below this store total, nobody wins. 0 = no gate.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Places &amp; prizes</Label>
            {rows.map((r, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{placeLabel(i)} place</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">Min sales</span>
                    <MoneyInput
                      currency={currency}
                      value={r.min_sales}
                      onValueChange={(v) =>
                        setRows((rs) =>
                          rs.map((x, j) => (j === i ? { ...x, min_sales: v } : x)),
                        )
                      }
                      className="w-28"
                      placeholder="none"
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      aria-label="Remove place"
                      onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                <PrizeItemsEditor
                  items={r.items}
                  currency={currency}
                  onChange={(items) =>
                    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, items } : x)))
                  }
                />
              </div>
            ))}
            {rows.length < 10 && (
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  setRows((rs) => [...rs, { min_sales: "", items: [emptyItemDraft()] }])
                }
              >
                <Plus className="mr-1 size-4" /> Add place
              </Button>
            )}
          </div>
        </div>
        <SheetFooter>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create contest"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
