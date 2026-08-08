"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, Check, Clock } from "lucide-react";
import { storeAckReminder } from "@/server/store-reminders";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type DueReminder = {
  id: string;
  label: string;
  note: string | null;
  dueAt: string; // "HH:mm", the slot that came due
};

const SNOOZE_MINUTES = 10;
const slotKey = (r: DueReminder) => `${r.id}:${r.dueAt}`;

/**
 * A chore the floor has to do on a schedule, in the way of everything until
 * someone does it. Deliberately not dismissible by tapping outside or pressing
 * Escape — that is the whole point of it.
 *
 * Snooze is CLIENT-ONLY and writes nothing: it survives the kiosk's 45s refresh
 * (which re-renders the layout but doesn't remount this component) and dies on
 * a reload. A chore you can permanently dismiss without doing isn't a reminder
 * — only "Done" clears the slot. The snooze is keyed to the slot, so silencing
 * 13:00 can never also silence 16:00.
 */
export function ReminderPopup({ reminder }: { reminder: DueReminder | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [snooze, setSnooze] = useState<{ slot: string; until: number } | null>(null);

  // Re-open when the snooze runs out, without waiting for the next refresh.
  useEffect(() => {
    if (!snooze) return;
    const id = setTimeout(
      () => setSnooze(null),
      Math.max(snooze.until - Date.now(), 0),
    );
    return () => clearTimeout(id);
  }, [snooze]);

  // No clock check here — the timer above is what clears an expired snooze, so
  // a live `snooze` for this slot IS the "still snoozed" answer. (Reading
  // Date.now() during render would also make this component impure.)
  const hidden = reminder !== null && snooze?.slot === slotKey(reminder);

  if (!reminder || hidden) return null;

  const done = () =>
    start(async () => {
      const res = await storeAckReminder({
        reminder_id: reminder.id,
        due_at: reminder.dueAt,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't mark it done.");
        return;
      }
      router.refresh();
    });

  const snoozeNow = () =>
    setSnooze({
      slot: slotKey(reminder),
      until: Date.now() + SNOOZE_MINUTES * 60_000,
    });

  return (
    // Controlled and held open, with onOpenChange ignored: nothing — outside
    // tap, Escape, swipe — can close it. Only the buttons below change state.
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="bg-primary/10 text-primary flex size-16 items-center justify-center rounded-full">
            <BellRing className="size-8" />
          </span>
          <div className="flex flex-col gap-1.5">
            <DialogTitle className="text-2xl">{reminder.label}</DialogTitle>
            {reminder.note && (
              <p className="text-muted-foreground text-base">{reminder.note}</p>
            )}
            <p className="text-muted-foreground text-sm tabular-nums">
              Scheduled for {reminder.dueAt}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 pt-1">
            <Button size="lg" className="h-16 text-base" disabled={pending} onClick={done}>
              <Check className="size-5" /> {pending ? "Saving…" : "Done"}
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="text-muted-foreground h-12"
              disabled={pending}
              onClick={snoozeNow}
            >
              <Clock className="size-4" /> Remind me in {SNOOZE_MINUTES} minutes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
