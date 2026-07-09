"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";

export type LineEntry = {
  employeeId: string;
  name: string;
  avatarColor: string | null;
  arrivedLabel: string;
};

function LineRow({
  entry,
  index,
  pending,
  onMakeUpNext,
}: {
  entry: LineEntry;
  index: number;
  pending: boolean;
  onMakeUpNext?: () => void;
}) {
  // disabled while an action is in flight — two concurrent reorders would
  // race each other and the last DB write would silently win
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.employeeId, disabled: pending });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        "bg-background flex items-center justify-between gap-2 py-3" +
        (isDragging ? " relative z-10 opacity-80" : "")
      }
    >
      <span className="flex items-center gap-2 text-base font-medium">
        <button
          type="button"
          aria-label={`Drag ${entry.name} to reorder`}
          className="text-muted-foreground touch-none px-1 py-2"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>
        <span className="text-muted-foreground w-6 text-center tabular-nums">
          {index + 1}
        </span>
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full border"
          style={{ backgroundColor: entry.avatarColor ?? "transparent" }}
        />
        {entry.name}
      </span>
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground mr-1 text-xs tabular-nums">
          since {entry.arrivedLabel}
        </span>
        {onMakeUpNext && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={onMakeUpNext}>
            Make up next
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The waiting line, reorderable by press-and-drag (iPad). The dragged order
 * is applied optimistically and held while the save is in flight so the 45s
 * auto-refresh can't snap the list back mid-gesture.
 */
export function QueueLine({
  entries,
  pending,
  onReorder,
  onMakeUpNext,
}: {
  entries: LineEntry[];
  pending: boolean;
  onReorder: (orderedIds: string[]) => Promise<boolean>;
  onMakeUpNext: (employeeId: string, name: string) => void;
}) {
  // Non-null while a local reorder is awaiting the server.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const byId = new Map(entries.map((e) => [e.employeeId, e]));
  const shown =
    localOrder
      ?.map((id) => byId.get(id))
      .filter((e): e is LineEntry => Boolean(e)) ?? entries;

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = shown.map((e) => e.employeeId);
    const next = arrayMove(
      ids,
      ids.indexOf(String(active.id)),
      ids.indexOf(String(over.id)),
    );
    setLocalOrder(next);
    // A rejected save (e.g. "the line changed") must drop the optimistic
    // order immediately — otherwise the kiosk keeps showing an order the
    // server refused, and calls up the wrong person until a hard reload.
    void onReorder(next).then((ok) => {
      if (!ok) setLocalOrder(null);
    });
  };

  // Server order arrived (entries changed while no drag pending) — drop the overlay.
  if (localOrder && !pending) {
    const serverIds = entries.map((e) => e.employeeId).join(",");
    if (serverIds === localOrder.join(",")) {
      setLocalOrder(null);
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={shown.map((e) => e.employeeId)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col divide-y">
          {shown.map((e, i) => (
            <LineRow
              key={e.employeeId}
              entry={e}
              index={i}
              pending={pending}
              onMakeUpNext={i > 0 ? () => onMakeUpNext(e.employeeId, e.name) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
