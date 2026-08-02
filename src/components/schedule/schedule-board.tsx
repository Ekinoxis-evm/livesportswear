"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X, CalendarOff, Check, GripVertical } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { isoWeekday } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { SLOT_COLOR } from "@/lib/shift-color";
import { ShiftChip } from "@/components/schedule/shift-chip";
import {
  SHIFT_SLOTS,
  templateForSlot,
  shiftMatchesSlot,
  slotCreatePayload,
} from "@/lib/shift-slots";
import { cn } from "@/lib/utils";
import { ensureSchedule, copyFromLastWeek } from "@/server/schedules";
import { createShift, deleteShift, moveShift, swapShifts } from "@/server/shifts";
import { decideTimeOff } from "@/server/time-off";

// Drag payloads: a chip carries the shift being moved; a drop target is either
// another chip (→ swap the two people) or an empty cell (→ move the shift there).
type DragData = { shiftId: string; employeeId: string; date: string; slotIndex: number };
type DropData =
  | { kind: "chip"; shiftId: string; employeeId: string }
  | { kind: "cell"; date: string; slotIndex: number };

/**
 * A shift chip with a drag HANDLE (grip), so the remove × and chip body stay
 * tappable and only the handle starts a drag. The whole chip is a drop target
 * too, so dropping another person onto it swaps their spots.
 */
function DraggableChip({
  shiftId,
  data,
  children,
}: {
  shiftId: string;
  data: DragData;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } =
    useDraggable({ id: `shift-${shiftId}`, data });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `chip-${shiftId}`,
    data: { kind: "chip", shiftId, employeeId: data.employeeId } satisfies DropData,
  });
  return (
    <div ref={setDropRef} className={cn("rounded-md", isOver && "ring-2 ring-primary/50")}>
      <div
        ref={setDragRef}
        style={{
          transform: CSS.Translate.toString(transform),
          opacity: isDragging ? 0.4 : 1,
        }}
        className="flex items-center gap-0.5"
      >
        <button
          type="button"
          aria-label="Drag shift"
          className="text-muted-foreground/50 hover:text-muted-foreground shrink-0 cursor-grab touch-none active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

/** An empty spot in a (slot × day) cell — dropping a shift here moves it. */
function DroppableCell({
  date,
  slotIndex,
  children,
}: {
  date: string;
  slotIndex: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${slotIndex}-${date}`,
    data: { kind: "cell", date, slotIndex } satisfies DropData,
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-8 flex-col gap-1 rounded-md p-0.5 transition-colors",
        isOver && "bg-primary/5 ring-1 ring-primary/30",
      )}
    >
      {children}
    </div>
  );
}
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
type Employee = { id: string; name: string; role: string; avatar_color: string | null };
type DayOff = {
  id: string;
  employee_id: string;
  date: string;
  status: "approved" | "pending";
};

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
  const colorOf = new Map(employees.map((e) => [e.id, e.avatar_color]));
  const managerIds = new Set(
    employees.filter((e) => e.role === "store_manager").map((e) => e.id),
  );
  const offByCell = new Map<string, "approved" | "pending">();
  for (const o of daysOff) {
    const key = `${o.employee_id}|${o.date}`;
    if (o.status === "approved" || !offByCell.has(key)) offByCell.set(key, o.status);
  }

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

  // Press-delay on touch + a small drag distance on mouse so the remove × and
  // the Add dropdown still register as taps, not drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function onDragEnd(e: DragEndEvent) {
    const a = e.active.data.current as DragData | undefined;
    const over = e.over?.data.current as DropData | undefined;
    if (!a || !over) return;

    if (over.kind === "chip") {
      // Drop onto another person → swap their spots (leaves no slot empty).
      if (over.shiftId === a.shiftId || over.employeeId === a.employeeId) return;
      run(swapShifts(a.shiftId, over.shiftId), "Shifts swapped.");
      return;
    }
    // Drop onto an empty cell → move the shift there (same person, new slot/day).
    if (over.date === a.date && over.slotIndex === a.slotIndex) return;
    const slot = SHIFT_SLOTS[over.slotIndex];
    const tpl = templateForSlot(slot, templates);
    const already = shifts.some(
      (s) => s.date === over.date && shiftMatchesSlot(s, slot, tpl) && s.employee_id === a.employeeId,
    );
    if (already) {
      toast.error(`${nameOf.get(a.employeeId) ?? "They"} already work that shift.`);
      return;
    }
    run(moveShift(a.shiftId, { date: over.date, ...slotCreatePayload(slot, templates) }), "Shift moved.");
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

  const slots = SHIFT_SLOTS.map((slot) => ({ slot, tpl: templateForSlot(slot, templates) }));
  const inAnySlot = (s: Shift) =>
    slots.some(({ slot, tpl }) => shiftMatchesSlot(s, slot, tpl));
  const otherShifts = shifts.filter((s) => !inAnySlot(s));

  function decide(id: string, status: "approved" | "rejected") {
    run(
      decideTimeOff(id, { status, note: "" }),
      status === "approved" ? "Day off approved." : "Request rejected.",
    );
  }

  function add(employeeId: string, date: string, slotIndex: number) {
    if (!scheduleId) return;
    run(
      createShift({
        schedule_id: scheduleId,
        employee_id: employeeId,
        date,
        ...slotCreatePayload(SHIFT_SLOTS[slotIndex], templates),
      }),
      "Shift added.",
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
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
                <th key={d} className="min-w-44 p-2 text-left align-top font-medium">
                  <div className="flex flex-col gap-1">
                    <span>
                      <span className="text-muted-foreground">
                        {SHORT_WEEKDAYS[isoWeekday(d) - 1]}
                      </span>{" "}
                      <span className="tabular-nums">{d.slice(8, 10)}</span>
                    </span>
                    {offToday.length > 0 && (
                      <div className="flex flex-wrap gap-1 font-normal">
                        {offToday.map((o) =>
                          o.status === "approved" ? (
                            <span
                              key={o.id}
                              className="bg-destructive/15 text-destructive inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px]"
                              title="Off (approved)"
                            >
                              <CalendarOff className="size-2.5" />
                              {nameOf.get(o.employee_id) ?? "—"}
                            </span>
                          ) : (
                            <DropdownMenu key={o.id}>
                              <DropdownMenuTrigger
                                render={
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-600 hover:bg-amber-500/20"
                                    title="Day-off requested — approve or reject"
                                  >
                                    <CalendarOff className="size-2.5" />
                                    {nameOf.get(o.employee_id) ?? "—"}?
                                  </button>
                                }
                              />
                              <DropdownMenuContent align="start">
                                <DropdownMenuItem onClick={() => decide(o.id, "approved")}>
                                  <Check className="size-4" /> Approve day off
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => decide(o.id, "rejected")}
                                >
                                  <X className="size-4" /> Reject
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {slots.map(({ slot, tpl }, slotIndex) => {
            const color = tpl?.color ?? SLOT_COLOR[slot.key] ?? "var(--color-primary)";
            const headcount = tpl?.default_headcount ?? 0;
            return (
              <tr key={slot.key} className="border-t align-top">
                <td className="bg-background sticky left-0 z-10 p-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span aria-hidden className="h-4 w-1 rounded" style={{ backgroundColor: color }} />
                    <span className="flex flex-col">
                      {slot.label}
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {slot.start}–{slot.end}
                      </span>
                    </span>
                  </span>
                </td>
                {days.map((d) => {
                  const assigned = shifts.filter(
                    (s) => s.date === d && shiftMatchesSlot(s, slot, tpl),
                  );
                  const assignedIds = new Set(assigned.map((s) => s.employee_id));
                  const available = employees.filter((e) => !assignedIds.has(e.id));
                  const under = headcount > 0 && assigned.length < headcount;
                  return (
                    <td key={d} className="border-l p-1.5 align-top">
                      <DroppableCell date={d} slotIndex={slotIndex}>
                        {assigned.map((s) => {
                          const off = offByCell.get(`${s.employee_id}|${d}`);
                          return (
                            <DraggableChip
                              key={s.id}
                              shiftId={s.id}
                              data={{ shiftId: s.id, employeeId: s.employee_id, date: d, slotIndex }}
                            >
                              <ShiftChip
                                name={nameOf.get(s.employee_id) ?? "—"}
                                color={colorOf.get(s.employee_id)}
                                isManager={managerIds.has(s.employee_id)}
                                off={!!off}
                                className="justify-between"
                                trailing={
                                  <button
                                    type="button"
                                    aria-label="Remove"
                                    disabled={busy}
                                    onClick={() => run(deleteShift(s.id), "Shift removed.")}
                                    className="shrink-0 opacity-60 hover:opacity-100"
                                  >
                                    <X className="size-3" />
                                  </button>
                                }
                              />
                            </DraggableChip>
                          );
                        })}

                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                disabled={busy || available.length === 0}
                                className={cn(
                                  "flex items-center justify-center gap-1 rounded-md border border-dashed py-1 text-xs transition-colors disabled:opacity-50",
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
                                  onClick={() => add(e.id, d, slotIndex)}
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
                            {assigned.length}/{headcount}
                          </span>
                        )}
                      </DroppableCell>
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {otherShifts.length > 0 && (
            <tr className="border-t align-top">
              <td className="bg-background text-muted-foreground sticky left-0 z-10 p-2 text-xs">
                Other shifts
              </td>
              {days.map((d) => {
                const custom = otherShifts.filter((s) => s.date === d);
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
    </DndContext>
  );
}
