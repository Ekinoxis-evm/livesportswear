"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, CalendarOff, Crown } from "lucide-react";
import { isoWeekday } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { shiftTint } from "@/lib/shift-color";
import {
  SHIFT_SLOTS,
  slotCreatePayload,
  templateForSlot,
  shiftMatchesSlot,
} from "@/lib/shift-slots";
import { cn } from "@/lib/utils";
import { ensureSchedule, copyFromLastWeek } from "@/server/schedules";
import { createShift, updateShift, deleteShift } from "@/server/shifts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CUSTOM = "custom";
const hhmm = (t: string) => t.slice(0, 5);

type Shift = {
  id: string;
  employee_id: string;
  date: string;
  shift_template_id: string | null;
  start_time: string;
  end_time: string;
  notes: string | null;
};
type Template = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string | null;
};
type Employee = { id: string; name: string; role: string; avatar_color: string | null };
type DayOff = { employee_id: string; date: string; status: "approved" | "pending" };

/** Canonical AM/PM label for a shift, or the template name / "Custom". */
function shiftSlotLabel(
  s: { shift_template_id: string | null; start_time: string; end_time: string },
  templates: Template[],
  fallback: string,
): string {
  const slot = SHIFT_SLOTS.find((sl) =>
    shiftMatchesSlot(s, sl, templateForSlot(sl, templates)),
  );
  return slot?.label ?? fallback;
}

type EditorCtx = { employeeId: string; date: string; shift: Shift | null };

export function ScheduleGrid({
  scheduleId,
  locationId,
  weekStart,
  days,
  employees,
  templates,
  shifts,
  hoursByEmployee,
  daysOff,
}: {
  scheduleId: string | null;
  locationId: string;
  weekStart: string;
  days: string[];
  employees: Employee[];
  templates: Template[];
  shifts: Shift[];
  hoursByEmployee: Record<string, number>;
  daysOff: DayOff[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<EditorCtx | null>(null);

  // editor form state
  const [templateId, setTemplateId] = useState<string>(CUSTOM);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [notes, setNotes] = useState("");

  const byCell = new Map<string, Shift[]>();
  const daysWorked = new Map<string, Set<string>>();
  for (const s of shifts) {
    const key = `${s.employee_id}|${s.date}`;
    const list = byCell.get(key) ?? [];
    list.push(s);
    byCell.set(key, list);
    const set = daysWorked.get(s.employee_id) ?? new Set<string>();
    set.add(s.date);
    daysWorked.set(s.employee_id, set);
  }

  const offByCell = new Map<string, "approved" | "pending">();
  for (const o of daysOff) {
    const key = `${o.employee_id}|${o.date}`;
    if (o.status === "approved" || !offByCell.has(key)) offByCell.set(key, o.status);
  }

  function openEditor(ctx: EditorCtx) {
    if (ctx.shift) {
      const slot = SHIFT_SLOTS.find((s) =>
        shiftMatchesSlot(ctx.shift!, s, templateForSlot(s, templates)),
      );
      setTemplateId(slot ? slot.key : CUSTOM);
      setStart(hhmm(ctx.shift.start_time));
      setEnd(hhmm(ctx.shift.end_time));
      setNotes(ctx.shift.notes ?? "");
    } else {
      // Default to the Morning shift with its predefined hours.
      setTemplateId(SHIFT_SLOTS[0].key);
      setStart(SHIFT_SLOTS[0].start);
      setEnd(SHIFT_SLOTS[0].end);
      setNotes("");
    }
    setEditor(ctx);
  }

  async function start_(action: Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await action;
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Something went wrong.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function onStartBlank() {
    if (await start_(ensureSchedule(locationId, weekStart))) {
      toast.success("Schedule started.");
    }
  }

  async function onCopyLastWeek() {
    setBusy(true);
    const res = await copyFromLastWeek(locationId, weekStart);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't copy.");
      return;
    }
    toast.success(`Copied ${res.data?.copied ?? 0} shifts from last week.`);
    router.refresh();
  }

  async function onSave() {
    if (!editor || !scheduleId) return;
    const slot = SHIFT_SLOTS.find((s) => s.key === templateId);
    const payload = slot
      ? { ...slotCreatePayload(slot, templates), notes }
      : { shift_template_id: null, start_time: start, end_time: end, notes };
    const ok = editor.shift
      ? await start_(updateShift(editor.shift.id, payload))
      : await start_(
          createShift({
            schedule_id: scheduleId,
            employee_id: editor.employeeId,
            date: editor.date,
            ...payload,
          }),
        );
    if (ok) {
      toast.success(editor.shift ? "Shift updated." : "Shift added.");
      setEditor(null);
    }
  }

  async function quickAdd(employeeId: string, date: string, slotIndex: number) {
    if (!scheduleId) return;
    if (
      await start_(
        createShift({
          schedule_id: scheduleId,
          employee_id: employeeId,
          date,
          ...slotCreatePayload(SHIFT_SLOTS[slotIndex], templates),
        }),
      )
    ) {
      toast.success("Shift added.");
    }
  }

  async function onDelete() {
    if (!editor?.shift) return;
    if (await start_(deleteShift(editor.shift.id))) {
      toast.success("Shift removed.");
      setEditor(null);
    }
  }

  if (!scheduleId) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground text-sm">
          No schedule yet for this week.
        </p>
        <div className="flex gap-2">
          <Button onClick={onStartBlank} disabled={busy}>
            Start blank schedule
          </Button>
          <Button variant="outline" onClick={onCopyLastWeek} disabled={busy}>
            Copy last week
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onCopyLastWeek}
          disabled={busy}
        >
          Copy last week
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 z-10 bg-muted/50 p-2 text-left font-medium">
                Employee
              </th>
              {days.map((d) => (
                <th key={d} className="min-w-32 p-2 text-left font-medium">
                  <span className="text-muted-foreground">
                    {SHORT_WEEKDAYS[isoWeekday(d) - 1]}
                  </span>{" "}
                  <span className="tabular-nums">{d.slice(8, 10)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td
                  colSpan={days.length + 1}
                  className="text-muted-foreground p-6 text-center"
                >
                  No active employees at this location.
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr key={emp.id} className="border-t">
                  <td className="bg-background sticky left-0 z-10 p-2 font-medium">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full border"
                        style={{
                          backgroundColor: emp.avatar_color ?? "transparent",
                        }}
                      />
                      <span className="flex flex-col">
                        <span className="flex items-center gap-1">
                          {emp.role === "store_manager" && (
                            <Crown className="size-3 shrink-0 text-amber-500" />
                          )}
                          {emp.name}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {(hoursByEmployee[emp.id] ?? 0).toFixed(1)}h ·{" "}
                          {daysWorked.get(emp.id)?.size ?? 0}d
                        </span>
                      </span>
                    </span>
                  </td>
                  {days.map((d) => {
                    const cell = byCell.get(`${emp.id}|${d}`) ?? [];
                    const off = offByCell.get(`${emp.id}|${d}`);
                    return (
                      <td
                        key={d}
                        className={cn(
                          "group border-l p-1 align-top transition-colors",
                          off ? "bg-destructive/10" : "hover:bg-muted/40",
                        )}
                      >
                        <div className="flex flex-col gap-1">
                          {off && (
                            <span className="text-destructive flex items-center gap-0.5 text-[10px] font-medium">
                              <CalendarOff className="size-2.5" />
                              {off === "approved" ? "Off" : "Off req."}
                            </span>
                          )}
                          {cell.map((s) => {
                            const tpl = templates.find(
                              (t) => t.id === s.shift_template_id,
                            );
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() =>
                                  openEditor({
                                    employeeId: emp.id,
                                    date: d,
                                    shift: s,
                                  })
                                }
                                className="flex flex-col rounded-md border border-l-4 px-2 py-1 text-left text-xs shadow-sm hover:brightness-105"
                                style={{
                                  // The person's own colour (same one on their
                                  // kiosk avatar) — the schedule reads by who,
                                  // not by shift type: a light tint fills the
                                  // shift, with a stronger left stripe.
                                  ...shiftTint(emp.avatar_color ?? tpl?.color),
                                  borderLeftColor:
                                    emp.avatar_color ?? tpl?.color ?? "var(--color-primary)",
                                }}
                              >
                                <span className="font-medium">
                                  {shiftSlotLabel(s, templates, tpl?.name ?? "Custom")}
                                </span>
                                <span className="text-muted-foreground tabular-nums">
                                  {hhmm(s.start_time)}–{hhmm(s.end_time)}
                                </span>
                              </button>
                            );
                          })}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label="Add shift"
                                  className="text-muted-foreground hover:bg-muted flex items-center justify-center rounded-md py-1 opacity-0 transition-opacity group-hover:opacity-100 data-[popup-open]:opacity-100"
                                >
                                  <Plus className="size-3.5" />
                                </button>
                              }
                            />
                            <DropdownMenuContent align="start">
                              {SHIFT_SLOTS.map((s, i) => (
                                <DropdownMenuItem
                                  key={s.key}
                                  onClick={() => quickAdd(emp.id, d, i)}
                                >
                                  {s.label} · {s.start}–{s.end}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  openEditor({ employeeId: emp.id, date: d, shift: null })
                                }
                              >
                                Custom…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Sheet
        open={editor !== null}
        onOpenChange={(o) => !o && setEditor(null)}
      >
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editor?.shift ? "Edit shift" : "Add shift"}</SheetTitle>
            <SheetDescription>
              {editor &&
                `${employees.find((e) => e.id === editor.employeeId)?.name} · ${editor.date}`}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="template">Shift</Label>
              <Select
                items={{
                  ...Object.fromEntries(
                    SHIFT_SLOTS.map((s) => [s.key, `${s.label} (${s.start}–${s.end})`]),
                  ),
                  [CUSTOM]: "Custom hours",
                }}
                value={templateId}
                onValueChange={(v) => {
                  const key = v ?? CUSTOM;
                  setTemplateId(key);
                  const slot = SHIFT_SLOTS.find((s) => s.key === key);
                  if (slot) {
                    setStart(slot.start);
                    setEnd(slot.end);
                  }
                }}
              >
                <SelectTrigger id="template" className="w-full">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {SHIFT_SLOTS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label} ({s.start}–{s.end})
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM}>Custom hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {templateId === CUSTOM && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="start">Start</Label>
                  <Input
                    id="start"
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="end">End</Label>
                  <Input
                    id="end"
                    type="time"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <SheetFooter className="flex-row justify-between">
            {editor?.shift ? (
              <Button
                variant="ghost"
                className="text-destructive"
                onClick={onDelete}
                disabled={busy}
              >
                Remove
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={onSave} disabled={busy}>
              {editor?.shift ? "Save" : "Add shift"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
