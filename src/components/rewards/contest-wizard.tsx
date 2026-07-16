"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Check } from "lucide-react";
import { createContest, updateContest } from "@/server/rewards";
import {
  placeLabelList,
  prizeLabel,
  type ContestPrize,
  type PrizeItem,
} from "@/lib/rewards";
import { formatMoney } from "@/lib/commission";
import { monthLabel } from "@/lib/format-date";
import { cn } from "@/lib/utils";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Wizard, type WizardStep } from "@/components/shared/wizard";
import {
  PrizeItemsEditor,
  emptyItemDraft,
  fromItemDrafts,
  toItemDrafts,
  type ItemDraft,
} from "@/components/rewards/prize-items-editor";
import { Plus, Trash2 } from "lucide-react";

const PLACE_LABELS = ["1st", "2nd", "3rd"];
const placeName = (i: number) => PLACE_LABELS[i] ?? `${i + 1}th`;

type PlaceDraft = { min_sales: string; items: ItemDraft[] };

export type ContestFormValues = {
  id: string;
  location_id: string;
  name: string;
  start_date: string;
  end_date: string;
  store_threshold: number;
  goal_source: "custom" | "monthly";
  personal_goals: Record<string, number>;
  prizes: ContestPrize[];
};

function draftComplete(d: ItemDraft): boolean {
  if (d.type === "cash") return Number(d.amount) > 0;
  if (d.type === "clothing") return d.garments.length > 0 && Number(d.qty) >= 1;
  return d.label.trim().length > 0;
}

export function ContestWizard({
  locations,
  employees,
  currency,
  contest,
  children,
}: {
  locations: { id: string; name: string }[];
  employees: { id: string; name: string; location_id: string }[];
  currency: string;
  contest?: ContestFormValues; // set = edit mode
  children: ReactElement;
}) {
  const router = useRouter();
  const isEdit = Boolean(contest);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seed = () => ({
    locationId: contest?.location_id ?? locations[0]?.id ?? "",
    name: contest?.name ?? "",
    startDate: contest?.start_date ?? "",
    endDate: contest?.end_date ?? "",
    threshold:
      contest && contest.store_threshold > 0 ? String(contest.store_threshold) : "",
    goalSource: contest?.goal_source ?? ("custom" as "custom" | "monthly"),
    personalGoals: Object.fromEntries(
      Object.entries(contest?.personal_goals ?? {}).map(([k, v]) => [k, String(v)]),
    ) as Record<string, string>,
    places:
      contest?.prizes.map((p) => ({
        min_sales: p.min_sales === null ? "" : String(p.min_sales),
        items: toItemDrafts(p.items),
      })) ?? [{ min_sales: "", items: [emptyItemDraft()] }],
  });

  const [locationId, setLocationId] = useState(seed().locationId);
  const [name, setName] = useState(seed().name);
  const [startDate, setStartDate] = useState(seed().startDate);
  const [endDate, setEndDate] = useState(seed().endDate);
  const [threshold, setThreshold] = useState(seed().threshold);
  const [goalSource, setGoalSource] = useState<"custom" | "monthly">(seed().goalSource);
  const [personalGoals, setPersonalGoals] = useState<Record<string, string>>(
    seed().personalGoals,
  );
  const [places, setPlaces] = useState<PlaceDraft[]>(seed().places);

  // The wizard instance stays mounted across dialog open/close, so every open
  // re-seeds from the contest (or blank) — a canceled edit or a finished
  // create must not leak into the next session.
  function openChange(next: boolean) {
    setOpen(next);
    if (next) {
      const s = seed();
      setLocationId(s.locationId);
      setName(s.name);
      setStartDate(s.startDate);
      setEndDate(s.endDate);
      setThreshold(s.threshold);
      setGoalSource(s.goalSource);
      setPersonalGoals(s.personalGoals);
      setPlaces(s.places);
      setStep(0);
      setError(null);
    }
  }

  function fail(msg: string): false {
    setError(msg);
    return false;
  }

  function reviewItems(): { place: number; min: number | null; items: PrizeItem[] }[] {
    return places.map((p, i) => ({
      place: i + 1,
      min: p.min_sales === "" ? null : Number(p.min_sales),
      items: fromItemDrafts(p.items) as PrizeItem[],
    }));
  }

  function save() {
    setPending(true);
    const payload = {
      ...(isEdit ? { id: contest!.id } : {}),
      location_id: locationId,
      name,
      start_date: startDate,
      end_date: endDate,
      store_threshold:
        goalSource === "monthly" || threshold === "" ? 0 : Number(threshold),
      goal_source: goalSource,
      personal_goals: Object.fromEntries(
        Object.entries(personalGoals)
          .filter(([, v]) => v !== "" && Number(v) > 0)
          .map(([k, v]) => [k, Number(v)]),
      ),
      prizes: places.map((p) => ({
        min_sales: p.min_sales === "" ? null : Number(p.min_sales),
        items: fromItemDrafts(p.items),
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

  const steps: WizardStep[] = [
    {
      title: "Basics",
      validate: () => {
        if (!name.trim()) return fail("Name the contest.");
        if (!startDate || !endDate) return fail("Pick both dates.");
        if (endDate < startDate) return fail("End date must be on or after the start.");
        setError(null);
        return true;
      },
      content: (
        <div className="flex flex-col gap-4 px-1">
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
            <Label htmlFor="cw-name">Name</Label>
            <Input
              id="cw-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="July sales push"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="cw-start">Starts</Label>
              <Input
                id="cw-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="cw-end">Ends</Label>
              <Input
                id="cw-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Store goal",
      content: (
        <div className="flex flex-col gap-3 px-1">
          <div className="flex flex-col gap-2">
            {(
              [
                {
                  value: "custom",
                  title: "Custom number for this challenge",
                  hint: "A special target measured on the contest period's sales — for mid-month or short quests.",
                },
                {
                  value: "monthly",
                  title: "The store's monthly goal",
                  hint: "Measured on the WHOLE month the contest ends in, against the goal configured on this setup page — nothing to type.",
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3",
                  goalSource === opt.value && "border-primary bg-primary/5",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="cw-goal-source"
                    checked={goalSource === opt.value}
                    onChange={() => setGoalSource(opt.value)}
                    className="size-3.5"
                  />
                  {opt.title}
                </span>
                <span className="text-muted-foreground pl-5 text-xs">{opt.hint}</span>
              </label>
            ))}
          </div>
          {goalSource === "custom" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cw-threshold">Store sales goal</Label>
              <MoneyInput
                id="cw-threshold"
                currency={currency}
                value={threshold}
                onValueChange={setThreshold}
                className="w-48"
                placeholder="0"
              />
            </div>
          )}
          <p className="text-muted-foreground text-sm">
            Prize items marked{" "}
            <span className="text-foreground font-medium">
              &ldquo;only if the store reaches its goal&rdquo;
            </span>{" "}
            unlock once this gate passes. Items without the mark are won on
            placement alone.{goalSource === "custom" && " Leave it at 0 for no store gate."}
          </p>
        </div>
      ),
    },
    {
      title: "Personal goals",
      content: (
        <div className="flex flex-col gap-3 px-1">
          <p className="text-muted-foreground text-sm">
            Optional target per rep for the contest period. Prize items marked{" "}
            <span className="text-foreground font-medium">
              &ldquo;only if they beat their personal goal&rdquo;
            </span>{" "}
            unlock only for reps who pass their own number. Leave blank for no
            personal goal.
          </p>
          {employees
            .filter((e) => e.location_id === locationId)
            .map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3">
                <span className="text-sm">{e.name}</span>
                <MoneyInput
                  currency={currency}
                  value={personalGoals[e.id] ?? ""}
                  onValueChange={(v) =>
                    setPersonalGoals((g) => ({ ...g, [e.id]: v }))
                  }
                  className="w-32"
                  placeholder="none"
                />
              </div>
            ))}
          {employees.filter((e) => e.location_id === locationId).length === 0 && (
            <p className="text-muted-foreground text-sm">
              No active employees at this store.
            </p>
          )}
        </div>
      ),
    },
    {
      title: "Places & prizes",
      validate: () => {
        if (places.length === 0) return fail("Add at least one place.");
        for (const [i, p] of places.entries()) {
          if (p.items.length === 0)
            return fail(`${placeName(i)} place needs at least one prize item.`);
          if (p.items.length > 8)
            return fail(`${placeName(i)} place has too many items (max 8).`);
          const bad = p.items.find((d) => !draftComplete(d));
          if (bad)
            return fail(
              `${placeName(i)} place has an incomplete ${bad.type} item.`,
            );
        }
        setError(null);
        return true;
      },
      content: (
        <div className="flex flex-col gap-3 px-1">
          {places.map((p, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{placeName(i)} place</span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Min sales</span>
                  <MoneyInput
                    currency={currency}
                    value={p.min_sales}
                    onValueChange={(v) =>
                      setPlaces((ps) =>
                        ps.map((x, j) => (j === i ? { ...x, min_sales: v } : x)),
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
                    onClick={() => setPlaces((ps) => ps.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
              <PrizeItemsEditor
                items={p.items}
                currency={currency}
                onChange={(items) =>
                  setPlaces((ps) => ps.map((x, j) => (j === i ? { ...x, items } : x)))
                }
              />
            </div>
          ))}
          {places.length < 10 && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                setPlaces((ps) => [...ps, { min_sales: "", items: [emptyItemDraft()] }])
              }
            >
              <Plus className="mr-1 size-4" /> Add place
            </Button>
          )}
        </div>
      ),
    },
    {
      title: "Review",
      content: (
        <div className="flex flex-col gap-3 px-1 text-sm">
          <div className="flex flex-col gap-1">
            <span className="font-semibold">{name || "—"}</span>
            <span className="text-muted-foreground tabular-nums">
              {locations.find((l) => l.id === locationId)?.name} · {startDate} →{" "}
              {endDate}
            </span>
            <span className="text-muted-foreground">
              Store gate:{" "}
              {goalSource === "monthly"
                ? `monthly goal of ${endDate ? monthLabel(endDate.slice(0, 7)) : "the end month"}`
                : threshold === "" || Number(threshold) === 0
                  ? "none"
                  : `${formatMoney(Number(threshold), currency)} (custom)`}
            </span>
            {Object.entries(personalGoals).filter(([, v]) => v !== "" && Number(v) > 0)
              .length > 0 && (
              <span className="text-muted-foreground">
                Personal goals:{" "}
                {employees
                  .filter(
                    (e) => personalGoals[e.id] && Number(personalGoals[e.id]) > 0,
                  )
                  .map((e) => `${e.name} ${formatMoney(Number(personalGoals[e.id]), currency)}`)
                  .join(" · ")}
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            {reviewItems().map((p, i) => (
              <li key={i} className="rounded-lg border p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{placeName(i)} place</span>
                  {p.min !== null && p.min > 0 && (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      min {formatMoney(p.min, currency)}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-xs">
                  {p.items.map((item, j) => {
                    const needs = [
                      item.requires_goal && "the store goal",
                      item.requires_personal && "their personal goal",
                    ].filter(Boolean);
                    return (
                      <span key={j} className="flex items-center gap-1.5">
                        {needs.length > 0 ? (
                          <Lock className="size-3" />
                        ) : (
                          <Check className="size-3" />
                        )}
                        {prizeLabel(item, currency)}
                        {needs.length > 0 && ` — needs ${needs.join(" + ")}`}
                      </span>
                    );
                  })}
                  {p.items.length > 1 && (
                    <span className="text-foreground/70 mt-0.5">
                      = {placeLabelList(p.items, currency)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger render={children} />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit contest" : "New contest"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Adjust the contest — finalized contests can't change."
              : "Five quick steps: basics, store goal, personal goals, prizes, review."}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Wizard
          steps={steps}
          step={step}
          onStepChange={(s) => {
            setError(null);
            setStep(s);
          }}
          onFinish={save}
          finishLabel={isEdit ? "Save changes" : "Create contest"}
          pending={pending}
        />
      </DialogContent>
    </Dialog>
  );
}
