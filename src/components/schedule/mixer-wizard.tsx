"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Shuffle, Sparkles, Wand2 } from "lucide-react";
import { weekDays, isoWeekday } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { SHIFT_SLOTS, templateForSlot, shiftMatchesSlot } from "@/lib/shift-slots";
import { fillSchedule, type MixerPlacement } from "@/lib/scheduling/generate";
import { applyMixer } from "@/server/schedules";
import { Wizard } from "@/components/shared/wizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type MixEmp = { id: string; name: string; role: string; maxDays: number; daysOff: number };
type MixTpl = { id: string; name: string; start_time: string; end_time: string; default_headcount: number };
type RawShift = {
  employee_id: string;
  date: string;
  shift_template_id: string | null;
  start_time: string;
  end_time: string;
};

export function MixerWizard({
  locationId,
  weekStart,
  employees,
  templates,
  timeOff,
  existingShifts,
}: {
  locationId: string;
  weekStart: string;
  employees: MixEmp[];
  templates: MixTpl[];
  timeOff: { employeeId: string; date: string }[];
  existingShifts: RawShift[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);

  const hasExisting = existingShifts.length > 0;
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const slotList = useMemo(
    () =>
      SHIFT_SLOTS.map((slot) => {
        const tpl = templateForSlot(slot, templates);
        return {
          key: slot.key,
          label: slot.label,
          start: slot.start,
          end: slot.end,
          templateId: tpl?.id ?? null,
          headcount: tpl?.default_headcount ?? 0,
        };
      }),
    [templates],
  );

  const [included, setIncluded] = useState<Set<string>>(new Set(employees.map((e) => e.id)));
  const [caps, setCaps] = useState<Record<string, { maxDays: number; daysOff: number }>>(
    Object.fromEntries(employees.map((e) => [e.id, { maxDays: e.maxDays, daysOff: e.daysOff }])),
  );
  const [headcounts, setHeadcounts] = useState<Record<string, number>>(
    Object.fromEntries(slotList.map((s) => [s.key, s.headcount])),
  );
  const [mode, setMode] = useState<"complete" | "scratch">(hasExisting ? "complete" : "scratch");
  const [seed, setSeed] = useState(1);

  const nameOf = new Map(employees.map((e) => [e.id, e.name]));

  // Live preview: run the SAME pure generator the server will (deterministic by
  // seed), so the applied week matches exactly.
  const preview = useMemo(() => {
    const selected = employees.filter((e) => included.has(e.id));
    const slots = slotList.map((s) => ({
      key: s.key,
      templateId: s.templateId,
      start: s.start,
      end: s.end,
      headcount: headcounts[s.key] ?? 0,
    }));
    const existing: MixerPlacement[] =
      mode === "complete"
        ? existingShifts.flatMap((sh) => {
            const slot = SHIFT_SLOTS.find((sl) => shiftMatchesSlot(sh, sl, templateForSlot(sl, templates)));
            return slot && included.has(sh.employee_id)
              ? [{ employeeId: sh.employee_id, date: sh.date, slotKey: slot.key }]
              : [];
          })
        : [];
    const res = fillSchedule({
      days,
      employees: selected.map((e) => ({
        id: e.id,
        maxDays: caps[e.id]?.maxDays ?? e.maxDays,
        daysOff: caps[e.id]?.daysOff ?? e.daysOff,
      })),
      slots,
      timeOff: timeOff.filter((t) => included.has(t.employeeId)),
      existing,
      seed,
    });
    // Map (date|slot) → names, for the grid.
    const byCell = new Map<string, string[]>();
    for (const p of [...existing, ...res.assignments]) {
      const k = `${p.date}|${p.slotKey}`;
      (byCell.get(k) ?? byCell.set(k, []).get(k)!).push(nameOf.get(p.employeeId) ?? "—");
    }
    const gapCount = res.gaps.reduce((s, g) => s + g.short, 0);
    return { byCell, added: res.assignments.length, gapCount, headcounts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [included, caps, headcounts, mode, seed, days, slotList]);

  function apply() {
    setPending(true);
    applyMixer({
      locationId,
      weekStart,
      employeeIds: [...included],
      caps: Object.fromEntries([...included].map((id) => [id, caps[id]])),
      headcounts,
      mode,
      seed,
    }).then((res) => {
      setPending(false);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't build the schedule.");
        return;
      }
      toast.success(
        `Filled ${res.data?.added ?? 0} shift(s)${res.data?.gaps ? ` · ${res.data.gaps} spot(s) still open` : ""}.`,
      );
      setOpen(false);
      router.refresh();
    });
  }

  const steps = [
    {
      title: "Who's in",
      content: (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Everyone&apos;s included by default — untick anyone who shouldn&apos;t be scheduled this week.
          </p>
          <div className="flex flex-col divide-y">
            {employees.map((e) => (
              <label key={e.id} className="flex items-center gap-2 py-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={included.has(e.id)}
                  onChange={(ev) =>
                    setIncluded((s) => {
                      const n = new Set(s);
                      if (ev.target.checked) n.add(e.id);
                      else n.delete(e.id);
                      return n;
                    })
                  }
                />
                {e.name}
                <span className="text-muted-foreground text-xs">{e.role.replace("_", " ")}</span>
              </label>
            ))}
          </div>
        </div>
      ),
      validate: () => included.size > 0 || (toast.error("Pick at least one person."), false),
    },
    {
      title: "Limits",
      content: (
        <div className="flex flex-col gap-4">
          <div>
            <Label className="text-sm">People per shift (this run)</Label>
            <div className="mt-1 flex flex-wrap gap-3">
              {slotList.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="text-sm">{s.label}</span>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-16"
                    value={headcounts[s.key] ?? 0}
                    onChange={(e) =>
                      setHeadcounts((h) => ({ ...h, [s.key]: Math.max(0, Number(e.target.value) || 0) }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-sm">Each person&apos;s limits (this run)</Label>
            <div className="mt-1 flex flex-col divide-y">
              {employees
                .filter((e) => included.has(e.id))
                .map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    <label className="text-muted-foreground flex items-center gap-1 text-xs">
                      max days
                      <Input
                        type="number"
                        min={0}
                        max={7}
                        className="h-8 w-14"
                        value={caps[e.id]?.maxDays ?? e.maxDays}
                        onChange={(ev) =>
                          setCaps((c) => ({
                            ...c,
                            [e.id]: { ...c[e.id], maxDays: Math.max(0, Math.min(7, Number(ev.target.value) || 0)) },
                          }))
                        }
                      />
                    </label>
                    <label className="text-muted-foreground flex items-center gap-1 text-xs">
                      days off
                      <Input
                        type="number"
                        min={0}
                        max={7}
                        className="h-8 w-14"
                        value={caps[e.id]?.daysOff ?? e.daysOff}
                        onChange={(ev) =>
                          setCaps((c) => ({
                            ...c,
                            [e.id]: { ...c[e.id], daysOff: Math.max(0, Math.min(7, Number(ev.target.value) || 0)) },
                          }))
                        }
                      />
                    </label>
                  </div>
                ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Generate",
      content: (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-muted flex rounded-md p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode("complete")}
                className={cn("rounded px-2 py-1", mode === "complete" && "bg-background shadow-sm")}
              >
                Complete (keep existing)
              </button>
              <button
                type="button"
                onClick={() => setMode("scratch")}
                className={cn("rounded px-2 py-1", mode === "scratch" && "bg-background shadow-sm")}
              >
                From scratch
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSeed((s) => s + 1)}>
              <Shuffle className="size-3.5" /> Reshuffle
            </Button>
            <span className="text-muted-foreground text-xs">
              {preview.added} to add
              {preview.gapCount > 0 && (
                <span className="text-amber-600"> · {preview.gapCount} spot(s) short</span>
              )}
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="p-1.5 text-left font-medium">Shift</th>
                  {days.map((d) => (
                    <th key={d} className="min-w-24 p-1.5 text-left font-medium">
                      {SHORT_WEEKDAYS[isoWeekday(d) - 1]} {d.slice(8, 10)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slotList.map((s) => (
                  <tr key={s.key} className="border-t align-top">
                    <td className="p-1.5 font-medium">{s.label}</td>
                    {days.map((d) => {
                      const names = preview.byCell.get(`${d}|${s.key}`) ?? [];
                      const short = (headcounts[s.key] ?? 0) - names.length;
                      return (
                        <td key={d} className="border-l p-1.5">
                          <div className="flex flex-col gap-0.5">
                            {names.map((n, i) => (
                              <span key={i} className="truncate">{n}</span>
                            ))}
                            {short > 0 && <span className="text-amber-600">+{short} open</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Sparkles className="size-4" /> Mix / auto-fill
          </Button>
        }
      />
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4" /> Auto-fill the week
          </DialogTitle>
          <DialogDescription>
            Pick who&apos;s in, tune the limits for this run, then generate — it respects each
            person&apos;s days and each shift&apos;s coverage. Reshuffle for a different valid week.
          </DialogDescription>
        </DialogHeader>
        <Wizard
          steps={steps}
          step={step}
          onStepChange={setStep}
          onFinish={apply}
          finishLabel="Apply to schedule"
          pending={pending}
          pendingLabel="Applying…"
        />
      </DialogContent>
    </Dialog>
  );
}
