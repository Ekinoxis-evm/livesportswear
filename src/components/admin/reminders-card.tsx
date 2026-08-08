"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, Plus, Trash2 } from "lucide-react";
import {
  saveReminder,
  setReminderActive,
  deleteReminder,
} from "@/server/store-reminders";
import { reminderTimes } from "@/lib/reminders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export type ReminderRow = {
  id: string;
  location_id: string;
  label: string;
  note: string | null;
  start_time: string;
  end_time: string;
  interval_minutes: number;
  active: boolean;
};

const hhmm = (t: string) => t.slice(0, 5);

/** The exact slots a setting produces — the whole reason the form previews. */
function Preview({
  startTime,
  endTime,
  intervalMinutes,
}: {
  startTime: string;
  endTime: string;
  intervalMinutes: number;
}) {
  const times = reminderTimes({ startTime, endTime, intervalMinutes });
  if (times.length === 0) {
    return (
      <p className="text-destructive text-xs">
        That doesn&apos;t produce any reminders — check the start, end and interval.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {times.map((t) => (
          <Badge key={t} variant="secondary" className="tabular-nums">
            {t}
          </Badge>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        {times.length} reminder{times.length === 1 ? "" : "s"} a day. The end time
        is a limit, not a slot — a step landing past it is dropped.
      </p>
    </div>
  );
}

function ReminderForm({
  locationId,
  existing,
  onDone,
}: {
  locationId: string;
  existing?: ReminderRow;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(existing?.label ?? "Spray the store perfume");
  const [note, setNote] = useState(existing?.note ?? "");
  const [startTime, setStartTime] = useState(hhmm(existing?.start_time ?? "10:00"));
  const [endTime, setEndTime] = useState(hhmm(existing?.end_time ?? "21:00"));
  const [hours, setHours] = useState(String((existing?.interval_minutes ?? 180) / 60));

  const intervalMinutes = Math.round(Number(hours) * 60);

  const submit = () =>
    start(async () => {
      const res = await saveReminder({
        id: existing?.id,
        location_id: locationId,
        label,
        note: note.trim() || undefined,
        start_time: startTime,
        end_time: endTime,
        interval_minutes: intervalMinutes,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't save.");
        return;
      }
      toast.success(existing ? "Reminder updated." : "Reminder added.");
      onDone();
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`label-${existing?.id ?? "new"}`}>What to do</Label>
        <Input
          id={`label-${existing?.id ?? "new"}`}
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`note-${existing?.id ?? "new"}`}>Detail (optional)</Label>
        <Input
          id={`note-${existing?.id ?? "new"}`}
          value={note}
          maxLength={200}
          placeholder="Two sprays by the door and one in the fitting rooms"
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`start-${existing?.id ?? "new"}`}>First</Label>
          <Input
            id={`start-${existing?.id ?? "new"}`}
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`every-${existing?.id ?? "new"}`}>Every (hours)</Label>
          <Input
            id={`every-${existing?.id ?? "new"}`}
            type="number"
            min={0.25}
            max={12}
            step={0.25}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`end-${existing?.id ?? "new"}`}>No later than</Label>
          <Input
            id={`end-${existing?.id ?? "new"}`}
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <Preview startTime={startTime} endTime={endTime} intervalMinutes={intervalMinutes} />

      <div className="flex gap-2">
        <Button
          disabled={pending || !label.trim() || intervalMinutes < 15}
          onClick={submit}
        >
          {pending ? "Saving…" : existing ? "Save changes" : "Add reminder"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Recurring kiosk reminders for one store. The schedule is a rule (first ·
 * every · no later than), and the preview shows the exact times it produces —
 * "every 3h from 10:00 to 21:00" is 10·13·16·19, which is worth seeing here
 * rather than discovering on the floor.
 */
export function RemindersCard({
  locationId,
  reminders,
}: {
  locationId: string;
  reminders: ReminderRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong.");
      else router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      {reminders.length === 0 && !adding && (
        <p className="text-muted-foreground text-sm">
          No reminders for this store yet.
        </p>
      )}

      {reminders.map((r) =>
        editing === r.id ? (
          <ReminderForm
            key={r.id}
            locationId={locationId}
            existing={r}
            onDone={() => setEditing(null)}
          />
        ) : (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
          >
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 font-medium">
                <BellRing className="text-muted-foreground size-3.5 shrink-0" />
                {r.label}
                {!r.active && <Badge variant="outline">paused</Badge>}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {reminderTimes({
                  startTime: r.start_time,
                  endTime: r.end_time,
                  intervalMinutes: r.interval_minutes,
                }).join(" · ") || "no times — check the settings"}
              </span>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setEditing(r.id)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => act(() => setReminderActive({ id: r.id, active: !r.active }))}
              >
                {r.active ? "Pause" : "Resume"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={pending}
                aria-label={`Delete ${r.label}`}
                onClick={() => act(() => deleteReminder({ id: r.id }))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ),
      )}

      {adding ? (
        <ReminderForm locationId={locationId} onDone={() => setAdding(false)} />
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add a reminder
        </Button>
      )}
    </div>
  );
}
