"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { isoWeekday } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
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
type Employee = { id: string; name: string; avatar_color: string | null };

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
}: {
  scheduleId: string | null;
  locationId: string;
  weekStart: string;
  days: string[];
  employees: Employee[];
  templates: Template[];
  shifts: Shift[];
  hoursByEmployee: Record<string, number>;
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
  for (const s of shifts) {
    const key = `${s.employee_id}|${s.date}`;
    const list = byCell.get(key) ?? [];
    list.push(s);
    byCell.set(key, list);
  }

  function openEditor(ctx: EditorCtx) {
    if (ctx.shift) {
      setTemplateId(ctx.shift.shift_template_id ?? CUSTOM);
      setStart(hhmm(ctx.shift.start_time));
      setEnd(hhmm(ctx.shift.end_time));
      setNotes(ctx.shift.notes ?? "");
    } else {
      const first = templates[0];
      setTemplateId(first ? first.id : CUSTOM);
      setStart(first ? hhmm(first.start_time) : "09:00");
      setEnd(first ? hhmm(first.end_time) : "17:00");
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
    const custom = templateId === CUSTOM;
    const payload = {
      shift_template_id: custom ? null : templateId,
      start_time: custom ? start : undefined,
      end_time: custom ? end : undefined,
      notes,
    };
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
                        {emp.name}
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {(hoursByEmployee[emp.id] ?? 0).toFixed(1)}h
                        </span>
                      </span>
                    </span>
                  </td>
                  {days.map((d) => {
                    const cell = byCell.get(`${emp.id}|${d}`) ?? [];
                    return (
                      <td
                        key={d}
                        className="hover:bg-muted/40 group border-l p-1 align-top transition-colors"
                      >
                        <div className="flex flex-col gap-1">
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
                                className="flex flex-col rounded-md border-l-4 bg-card px-2 py-1 text-left text-xs shadow-sm hover:brightness-110"
                                style={{
                                  borderLeftColor:
                                    tpl?.color ?? "var(--color-primary)",
                                }}
                              >
                                <span className="font-medium">
                                  {tpl?.name ?? "Custom"}
                                </span>
                                <span className="text-muted-foreground tabular-nums">
                                  {hhmm(s.start_time)}–{hhmm(s.end_time)}
                                </span>
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            aria-label="Add shift"
                            onClick={() =>
                              openEditor({
                                employeeId: emp.id,
                                date: d,
                                shift: null,
                              })
                            }
                            className="text-muted-foreground hover:bg-muted flex items-center justify-center rounded-md py-1 opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <Plus className="size-3.5" />
                          </button>
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
                    templates.map((t) => [
                      t.id,
                      `${t.name} (${hhmm(t.start_time)}–${hhmm(t.end_time)})`,
                    ]),
                  ),
                  [CUSTOM]: "Custom hours",
                }}
                value={templateId}
                onValueChange={(v) => setTemplateId(v ?? CUSTOM)}
              >
                <SelectTrigger id="template" className="w-full">
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({hhmm(t.start_time)}–{hhmm(t.end_time)})
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
