"use client";

import { useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Check } from "lucide-react";
import { createContest, updateContest } from "@/server/rewards";
import {
  conditionsLabel,
  ordinal,
  placeLabelList,
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

const POSITION_ITEMS: Record<string, string> = {
  any: "Anyone",
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [String(i + 1), ordinal(i + 1)]),
  ),
};

type PrizeDraft = {
  items: ItemDraft[];
  position: string; // "" = anyone, else "1".."10"
  min_sales: string;
  requires_store_goal: boolean;
  requires_personal_goal: boolean;
};

const emptyPrizeDraft = (): PrizeDraft => ({
  items: [emptyItemDraft()],
  position: "",
  min_sales: "",
  requires_store_goal: false,
  requires_personal_goal: false,
});

export type ContestFormValues = {
  id: string;
  location_id: string;
  name: string;
  start_date: string;
  end_date: string;
  store_threshold: number;
  goal_source: "custom" | "monthly";
  personal_source: "custom" | "monthly";
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
    personalSource: contest?.personal_source ?? ("custom" as "custom" | "monthly"),
    personalGoals: Object.fromEntries(
      Object.entries(contest?.personal_goals ?? {}).map(([k, v]) => [k, String(v)]),
    ) as Record<string, string>,
    prizes:
      contest?.prizes.map((p) => ({
        items: toItemDrafts(p.items),
        position: p.conditions.position === null ? "" : String(p.conditions.position),
        min_sales:
          p.conditions.min_sales === null ? "" : String(p.conditions.min_sales),
        requires_store_goal: p.conditions.requires_store_goal,
        requires_personal_goal: p.conditions.requires_personal_goal,
      })) ?? [emptyPrizeDraft()],
  });

  const [locationId, setLocationId] = useState(seed().locationId);
  const [name, setName] = useState(seed().name);
  const [startDate, setStartDate] = useState(seed().startDate);
  const [endDate, setEndDate] = useState(seed().endDate);
  const [threshold, setThreshold] = useState(seed().threshold);
  const [goalSource, setGoalSource] = useState<"custom" | "monthly">(seed().goalSource);
  const [personalSource, setPersonalSource] = useState<"custom" | "monthly">(
    seed().personalSource,
  );
  const [personalGoals, setPersonalGoals] = useState<Record<string, string>>(
    seed().personalGoals,
  );
  const [prizes, setPrizes] = useState<PrizeDraft[]>(seed().prizes);

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
      setPersonalSource(s.personalSource);
      setPersonalGoals(s.personalGoals);
      setPrizes(s.prizes);
      setStep(0);
      setError(null);
    }
  }

  function fail(msg: string): false {
    setError(msg);
    return false;
  }

  function draftConditions(p: PrizeDraft) {
    return {
      position: p.position === "" ? null : Number(p.position),
      min_sales: p.min_sales === "" ? null : Number(p.min_sales),
      requires_store_goal: p.requires_store_goal,
      requires_personal_goal: p.requires_personal_goal,
    };
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
      personal_source: personalSource,
      personal_goals:
        personalSource === "custom"
          ? Object.fromEntries(
              Object.entries(personalGoals)
                .filter(([, v]) => v !== "" && Number(v) > 0)
                .map(([k, v]) => [k, Number(v)]),
            )
          : {},
      prizes: prizes.map((p) => ({
        items: fromItemDrafts(p.items),
        conditions: draftConditions(p),
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
          <div className="flex flex-col gap-2">
            {(
              [
                {
                  value: "custom",
                  title: "Custom targets for this challenge",
                  hint: "Type each rep's number below — measured on the contest period's sales.",
                },
                {
                  value: "monthly",
                  title: "Their monthly personal goals",
                  hint: "Measured on the WHOLE month the contest ends in, against each rep's monthly goal from the Personal goals card on this setup page.",
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 rounded-lg border p-3",
                  personalSource === opt.value && "border-primary bg-primary/5",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="cw-personal-source"
                    checked={personalSource === opt.value}
                    onChange={() => setPersonalSource(opt.value)}
                    className="size-3.5"
                  />
                  {opt.title}
                </span>
                <span className="text-muted-foreground pl-5 text-xs">{opt.hint}</span>
              </label>
            ))}
          </div>
          {personalSource === "custom" && (
            <>
              <p className="text-muted-foreground text-sm">
                Prizes with the personal-goal condition unlock only for reps who
                pass their number. Leave blank for no personal goal.
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
            </>
          )}
        </div>
      ),
    },
    {
      title: "Prizes",
      validate: () => {
        if (prizes.length === 0) return fail("Add at least one prize.");
        for (const [i, p] of prizes.entries()) {
          if (p.items.length === 0)
            return fail(`Prize ${i + 1} needs at least one item.`);
          if (p.items.length > 8)
            return fail(`Prize ${i + 1} has too many items (max 8).`);
          const bad = p.items.find((d) => !draftComplete(d));
          if (bad) return fail(`Prize ${i + 1} has an incomplete ${bad.type} item.`);
        }
        setError(null);
        return true;
      },
      content: (
        <div className="flex flex-col gap-3 px-1">
          <p className="text-muted-foreground text-sm">
            Each prize has its own conditions. A prize with position
            &ldquo;Anyone&rdquo; is won by <em>every</em> rep who meets the rest.
          </p>
          {prizes.map((p, i) => {
            const patch = (patchP: Partial<PrizeDraft>) =>
              setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, ...patchP } : x)));
            return (
              <div key={i} className="flex flex-col gap-2 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Prize {i + 1}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive ml-auto"
                    aria-label="Remove prize"
                    onClick={() => setPrizes((ps) => ps.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <PrizeItemsEditor
                  items={p.items}
                  currency={currency}
                  onChange={(items) => patch({ items })}
                />
                <div className="flex flex-wrap items-end gap-3 border-t pt-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">Position</span>
                    <Select
                      items={POSITION_ITEMS}
                      value={p.position === "" ? "any" : p.position}
                      onValueChange={(v) =>
                        patch({ position: !v || v === "any" ? "" : v })
                      }
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue placeholder="Anyone" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(POSITION_ITEMS).map(([v, label]) => (
                          <SelectItem key={v} value={v}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">Min sales</span>
                    <MoneyInput
                      currency={currency}
                      value={p.min_sales}
                      onValueChange={(v) => patch({ min_sales: v })}
                      className="w-28"
                      placeholder="none"
                    />
                  </div>
                  <label className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={p.requires_store_goal}
                      onChange={(e) => patch({ requires_store_goal: e.target.checked })}
                      className="size-3.5"
                    />
                    Store goal
                  </label>
                  <label className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={p.requires_personal_goal}
                      onChange={(e) =>
                        patch({ requires_personal_goal: e.target.checked })
                      }
                      className="size-3.5"
                    />
                    Personal goal
                  </label>
                </div>
              </div>
            );
          })}
          {prizes.length < 10 && (
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setPrizes((ps) => [...ps, emptyPrizeDraft()])}
            >
              <Plus className="mr-1 size-4" /> Add prize
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
            {prizes.map((p, i) => {
              const conditions = draftConditions(p);
              const items = fromItemDrafts(p.items) as PrizeItem[];
              const anyone = conditions.position === null;
              return (
                <li key={i} className="rounded-lg border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {placeLabelList(items, currency)}
                    </span>
                    {anyone ? (
                      <Check className="text-primary size-3.5 shrink-0" />
                    ) : (
                      <Lock className="text-muted-foreground size-3.5 shrink-0" />
                    )}
                  </div>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {anyone && conditionsLabel(conditions, currency) === "everyone"
                      ? "Everyone wins this"
                      : `${anyone ? "Anyone who reaches" : "Needs"}: ${conditionsLabel(conditions, currency)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger render={children} />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
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
