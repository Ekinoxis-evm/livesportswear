"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { setStoreMonth } from "@/server/goals";
import { setEmployeeGoals } from "@/server/employee-goals";
import { formatMoney, type CommissionTier } from "@/lib/commission";
import { storeGoalLevels } from "@/lib/goal-levels";
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
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type GoalsByLocation = Record<string, Record<string, number>>;
export type EmployeeGoalsByKey = Record<string, Record<string, number>>;

type Row = { min_sales: string; rate: string };
const toRows = (tiers: CommissionTier[]): Row[] =>
  tiers.map((t) => ({ min_sales: String(t.min_sales), rate: String(t.rate * 100) }));

/**
 * One panel to set a month's commission tiers, per-rep personal goals and the
 * store goal together — under a SINGLE month picker, so they can't drift apart.
 * The relationship is first-class: the personal goal is the first tier that
 * unlocks more commission, and the store goal is the sum of the personal goals.
 * Apply buttons fill those in from the live edits; a coherence strip flags when
 * they don't line up. Replaces StoreMonthForm + EmployeeGoalsForm + GoalsOverview.
 */
export function MonthlySetup({
  locations,
  employees,
  year,
  month,
  goalsByLocation,
  tiersByKey,
  globalTiers,
  goalsByEmployee,
  currency,
}: {
  locations: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  year: number;
  month: number;
  goalsByLocation: GoalsByLocation;
  tiersByKey: Record<string, CommissionTier[]>;
  globalTiers: CommissionTier[];
  goalsByEmployee: EmployeeGoalsByKey;
  currency: string;
}) {
  const router = useRouter();
  const years = [year, year + 1];
  const money = (n: number) => formatMoney(n, currency);

  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [yearSel, setYearSel] = useState(year);
  const [monthSel, setMonthSel] = useState(month);
  const [pending, setPending] = useState(false);

  const goalOf = (loc: string, y: number, m: number) =>
    goalsByLocation[loc]?.[`${y}-${m}`] != null ? String(goalsByLocation[loc][`${y}-${m}`]) : "";
  const tiersOf = (loc: string, y: number, m: number) => tiersByKey[`${loc}-${y}-${m}`];
  const personalFor = (y: number, m: number): Record<string, string> =>
    Object.fromEntries(
      employees.map((e) => {
        const v = goalsByEmployee[e.id]?.[`${y}-${m}`];
        return [e.id, v != null && v > 0 ? String(v) : ""];
      }),
    );

  const [goal, setGoal] = useState(goalOf(locationId, yearSel, monthSel));
  const [rows, setRows] = useState<Row[]>(toRows(tiersOf(locationId, yearSel, monthSel) ?? globalTiers));
  const [inherited, setInherited] = useState(!tiersOf(locationId, yearSel, monthSel));
  const [personal, setPersonal] = useState<Record<string, string>>(personalFor(yearSel, monthSel));

  function load(loc: string, y: number, m: number) {
    setGoal(goalOf(loc, y, m));
    const t = tiersOf(loc, y, m);
    setRows(toRows(t ?? globalTiers));
    setInherited(!t);
    setPersonal(personalFor(y, m));
  }

  // Live derivations from the in-progress edits — drive the Apply buttons + strip.
  const currentTiers: CommissionTier[] = inherited
    ? globalTiers
    : rows
        .filter((r) => r.min_sales !== "" && r.rate !== "")
        .map((r) => ({ min_sales: Number(r.min_sales), rate: Number(r.rate) / 100 }));
  const firstTier = useMemo(() => {
    const positive = currentTiers.filter((t) => t.min_sales > 0).map((t) => t.min_sales);
    return positive.length ? Math.min(...positive) : 0;
  }, [currentTiers]);
  const personalSum = employees.reduce((s, e) => s + (Number(personal[e.id]) || 0), 0);
  const positivePersonal = employees
    .map((e) => Number(personal[e.id]) || 0)
    .filter((g) => g > 0);
  const levels = storeGoalLevels({
    tiers: currentTiers,
    activeReps: employees.length,
    storeGoal: goal === "" ? 0 : Number(goal),
    personalGoalSum: personalSum,
    basePersonalGoal: positivePersonal.length ? Math.min(...positivePersonal) : 0,
  });

  function save() {
    setPending(true);
    const tiers = inherited ? [] : currentTiers;
    (async () => {
      const r1 = await setStoreMonth({
        location_id: locationId,
        year: yearSel,
        month: monthSel,
        goal_amount: goal === "" ? 0 : Number(goal),
        tiers,
      });
      if (!r1.ok) return r1;
      return setEmployeeGoals({
        year: yearSel,
        month: monthSel,
        entries: employees.map((e) => ({
          employee_id: e.id,
          goal_amount: personal[e.id] === "" || personal[e.id] == null ? 0 : Number(personal[e.id]),
        })),
      });
    })().then((res) => {
      setPending(false);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't save.");
        return;
      }
      toast.success("Saved this month's goals & commission.");
      router.refresh();
    });
  }

  if (locations.length === 0) {
    return <p className="text-muted-foreground text-sm">Add a location first.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Month picker (+ store, only when there's more than one) */}
      <div className="flex flex-wrap items-end gap-3">
        {locations.length > 1 && (
          <Field label="Store">
            <Select
              items={Object.fromEntries(locations.map((l) => [l.id, l.name]))}
              value={locationId}
              onValueChange={(v) => {
                if (!v) return;
                setLocationId(v);
                load(v, yearSel, monthSel);
              }}
            >
              <SelectTrigger className="w-48"><SelectValue placeholder="Store" /></SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Month">
          <Select
            items={Object.fromEntries(MONTHS.map((m, i) => [String(i + 1), m]))}
            value={String(monthSel)}
            onValueChange={(v) => {
              if (!v) return;
              const m = Number(v);
              setMonthSel(m);
              load(locationId, yearSel, m);
            }}
          >
            <SelectTrigger className="w-40"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Year">
          <Select
            items={Object.fromEntries(years.map((y) => [String(y), String(y)]))}
            value={String(yearSel)}
            onValueChange={(v) => {
              if (!v) return;
              const y = Number(v);
              setYearSel(y);
              load(locationId, y, monthSel);
            }}
          >
            <SelectTrigger className="w-28"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* 1 · Commission tiers */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>1 · Commission tiers</Label>
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
        <p className="text-muted-foreground text-xs">
          Each threshold is per rep. The first paid tier
          {firstTier > 0 && <> (<span className="font-medium tabular-nums">{money(firstTier)}</span>)</>}{" "}
          is the goal that unlocks more commission.
        </p>
        {!inherited &&
          rows.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Threshold</span>
                <MoneyInput
                  currency={currency}
                  value={r.min_sales}
                  onValueChange={(v) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, min_sales: v } : x)))}
                  className="w-36"
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">Rate %</span>
                <Input
                  inputMode="decimal"
                  value={r.rate}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))}
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
            Using the global default tiers. Untick to set custom rates for this month.
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
      </section>

      {/* 2 · Personal goals */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>2 · Personal goals</Label>
          {firstTier > 0 && (
            <Button variant="outline" size="sm" onClick={() => setPersonal(Object.fromEntries(employees.map((e) => [e.id, String(firstTier)])))}>
              <Wand2 className="mr-1 size-3.5" /> Fill all from first tier ({money(firstTier)})
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {employees.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3">
              <span className="text-sm">{e.name}</span>
              <MoneyInput
                currency={currency}
                value={personal[e.id] ?? ""}
                onValueChange={(v) => setPersonal((vals) => ({ ...vals, [e.id]: v }))}
                className="w-36"
                placeholder="none"
              />
            </div>
          ))}
          {employees.length === 0 && (
            <p className="text-muted-foreground text-sm">No active employees.</p>
          )}
        </div>
      </section>

      {/* 3 · Store goal */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="store-goal">3 · Store goal</Label>
          {personalSum > 0 && (
            <Button variant="outline" size="sm" onClick={() => setGoal(String(personalSum))}>
              <Wand2 className="mr-1 size-3.5" /> Set to sum of personal goals ({money(personalSum)})
            </Button>
          )}
        </div>
        <MoneyInput
          id="store-goal"
          currency={currency}
          value={goal}
          onValueChange={setGoal}
          className="w-48"
          placeholder="0"
        />
      </section>

      {/* Coherence strip — live from the edits above */}
      <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Fig label="Store goal" value={goal === "" || Number(goal) === 0 ? "—" : money(Number(goal))} />
          <Fig label="Σ personal goals" value={money(personalSum)} />
          <Fig label="First level (× team)" value={levels.base > 0 ? money(levels.base) : "—"} />
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <Note
            ok={levels.personalSumVsGoal === "match"}
            show={levels.personalSumVsGoal !== "none"}
            text={
              levels.personalSumVsGoal === "match"
                ? "Personal goals sum to the store goal."
                : `Personal goals ${money(Math.abs(personalSum - Number(goal || 0)))} ${levels.personalSumVsGoal} the store goal.`
            }
          />
          <Note
            ok={levels.goalVsBase === "match"}
            show={levels.goalVsBase !== "none"}
            text={
              levels.goalVsBase === "match"
                ? "Store goal lines up with the first commission level."
                : `Store goal ${money(Math.abs(Number(goal || 0) - levels.base))} ${levels.goalVsBase} the first level.`
            }
          />
          {levels.tierBelowPersonalGoal && (
            <Note ok={false} show text="A commission tier sits below a personal goal — tiers should reward beating the goal." />
          )}
        </div>
      </div>

      <div>
        <Button size="sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save this month"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Fig({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-muted-foreground text-[11px] uppercase tracking-wide">{label}</span>
      <span className="text-lg font-bold tabular-nums">{value}</span>
    </span>
  );
}

function Note({ ok, show, text }: { ok: boolean; show: boolean; text: string }) {
  if (!show) return null;
  return (
    <span className={cn(ok ? "text-emerald-600" : "text-amber-600")}>
      {ok ? "✓" : "⚠"} {text}
    </span>
  );
}
