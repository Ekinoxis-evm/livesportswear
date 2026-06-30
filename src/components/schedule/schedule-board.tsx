"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X, CalendarOff } from "lucide-react";
import { isoWeekday } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { cn } from "@/lib/utils";
import { ensureSchedule, copyFromLastWeek } from "@/server/schedules";
import { createShift, deleteShift } from "@/server/shifts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const hhmm = (t: string) => t.slice(0, 5);

type Shift = {
  id: string;
  employee_id: string;
  date: string;
  shift_template_id: string | null;
  start_time: string;
  end_time: string;
};
type Template = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string | null;
  default_headcount: number;
};
type Employee = { id: string; name: string; avatar_color: string | null };
type DayOff = { employee_id: string; date: string; status: "approved" | "pending" };

export function ScheduleBoard({
  scheduleId,
  locationId,
  weekStart,
  days,
  employees,
  templates,
  shifts,
  daysOff,
}: {
  scheduleId: string | null;
  locationId: string;
  weekStart: string;
  days: string[];
  employees: Employee[];
  templates: Template[];
  shifts: Shift[];
  daysOff: DayOff[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const nameOf = new Map(employees.map((e) => [e.id, e.name]));
  const offByCell = new Map<string, "approved" | "pending">();
  for (const o of daysOff) {
    const key = `${o.employee_id}|${o.date}`;
    if (o.status === "approved" || !offByCell.has(key)) offByCell.set(key, o.status);
  }

  // shifts indexed by template + day, and the per-day off list.
  const bySlot = new Map<string, Shift[]>(); // `${templateId|custom}|${date}`
  for (const s of shifts) {
    const key = `${s.shift_template_id ?? "custom"}|${s.date}`;
    const arr = bySlot.get(key) ?? [];
    arr.push(s);
    bySlot.set(key, arr);
  }
  const hasCustom = shifts.some((s) => !s.shift_template_id);

  async function run(action: Promise<{ ok: boolean; error?: string }>, ok: string) {
    setBusy(true);
    const res = await action;
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Something went wrong.");
      return;
    }
    toast.success(ok);
    router.refresh();
  }

  function add(employeeId: string, date: string, templateId: string) {
    if (!scheduleId) return;
    run(
      createShift({
        schedule_id: scheduleId,
        employee_id: employeeId,
        date,
        shift_template_id: templateId,
      }),
      "Shift added.",
    );
  }

  if (!scheduleId) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground text-sm">No schedule yet for this week.</p>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={() => run(ensureSchedule(locationId, weekStart), "Schedule started.")}
          >
            Start blank schedule
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(copyFromLastWeek(locationId, weekStart), "Copied last week.")
            }
          >
            Copy last week
          </Button>
        </div>
      </div>
    );
  }

  const slots: { id: string; label: string; tpl: Template }[] = templates.map((t) => ({
    id: t.id,
    label: t.name,
    tpl: t,
  }));

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="sticky left-0 z-10 bg-muted/50 p-2 text-left font-medium">
              Shift
            </th>
            {days.map((d) => {
              const offToday = daysOff.filter((o) => o.date === d);
              return (
                <th key={d} className="min-w-36 p-2 text-left align-top font-medium">
                  <div className="flex flex-col gap-1">
                    <span>
                      <span className="text-muted-foreground">
                        {SHORT_WEEKDAYS[isoWeekday(d) - 1]}
                      </span>{" "}
                      <span className="tabular-nums">{d.slice(8, 10)}</span>
                    </span>
                    {offToday.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {offToday.map((o) => (
                          <span
                            key={o.employee_id}
                            className="bg-destructive/15 text-destructive inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-normal"
                            title={o.status === "approved" ? "Off (approved)" : "Off requested"}
                          >
                            <CalendarOff className="size-2.5" />
                            {nameOf.get(o.employee_id) ?? "—"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => (
            <tr key={slot.id} className="border-t align-top">
              <td className="bg-background sticky left-0 z-10 p-2">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden
                    className="h-4 w-1 rounded"
                    style={{ backgroundColor: slot.tpl.color ?? "var(--color-primary)" }}
                  />
                  <span className="flex flex-col">
                    {slot.label}
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {hhmm(slot.tpl.start_time)}–{hhmm(slot.tpl.end_time)}
                    </span>
                  </span>
                </span>
              </td>
              {days.map((d) => {
                const assigned = bySlot.get(`${slot.id}|${d}`) ?? [];
                const assignedIds = new Set(assigned.map((s) => s.employee_id));
                const under = assigned.length < slot.tpl.default_headcount;
                const available = employees.filter((e) => !assignedIds.has(e.id));
                return (
                  <td key={d} className="border-l p-1.5 align-top">
                    <div className="flex flex-col gap-1">
                      {assigned.map((s) => {
                        const off = offByCell.get(`${s.employee_id}|${d}`);
                        return (
                          <span
                            key={s.id}
                            className={cn(
                              "flex items-center justify-between gap-1 rounded-md px-2 py-1 text-xs",
                              off ? "bg-destructive/15 text-destructive" : "bg-muted",
                            )}
                          >
                            <span className="truncate">{nameOf.get(s.employee_id)}</span>
                            <button
                              type="button"
                              aria-label="Remove"
                              disabled={busy}
                              onClick={() => run(deleteShift(s.id), "Shift removed.")}
                              className="shrink-0 opacity-60 hover:opacity-100"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        );
                      })}

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              disabled={busy || available.length === 0}
                              className={cn(
                                "flex items-center justify-center gap-1 rounded-md border border-dashed py-1 text-xs transition-colors",
                                under
                                  ? "border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                                  : "text-muted-foreground hover:bg-muted",
                              )}
                            >
                              <Plus className="size-3" /> Add
                            </button>
                          }
                        />
                        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                          {available.map((e) => {
                            const off = offByCell.get(`${e.id}|${d}`);
                            return (
                              <DropdownMenuItem
                                key={e.id}
                                onClick={() => add(e.id, d, slot.id)}
                                className={off ? "text-destructive" : ""}
                              >
                                {e.name}
                                {off ? (
                                  <span className="ml-auto text-[10px]">
                                    {off === "approved" ? "off" : "off req."}
                                  </span>
                                ) : null}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {under && assigned.length > 0 && (
                        <span className="text-[10px] text-amber-600">
                          {assigned.length}/{slot.tpl.default_headcount}
                        </span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}

          {hasCustom && (
            <tr className="border-t align-top">
              <td className="bg-background text-muted-foreground sticky left-0 z-10 p-2 text-xs">
                Other shifts
              </td>
              {days.map((d) => {
                const custom = bySlot.get(`custom|${d}`) ?? [];
                return (
                  <td key={d} className="border-l p-1.5 align-top">
                    <div className="flex flex-col gap-1">
                      {custom.map((s) => (
                        <span
                          key={s.id}
                          className="bg-muted flex items-center justify-between gap-1 rounded-md px-2 py-1 text-xs"
                        >
                          <span className="truncate">
                            {nameOf.get(s.employee_id)} · {hhmm(s.start_time)}–
                            {hhmm(s.end_time)}
                          </span>
                          <button
                            type="button"
                            aria-label="Remove"
                            disabled={busy}
                            onClick={() => run(deleteShift(s.id), "Shift removed.")}
                            className="shrink-0 opacity-60 hover:opacity-100"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
