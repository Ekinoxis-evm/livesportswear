"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, CalendarX, CheckCircle2, LogIn } from "lucide-react";
import { checkIn } from "@/server/floor";
import { Button } from "@/components/ui/button";

export type ShiftTodayInfo = {
  label: string; // "Morning" | "Evening" | template name | "Shift"
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

export function ShiftToday({
  meId,
  shift,
  checkedInAtLabel,
  leftFloor,
}: {
  meId: string;
  shift: ShiftTodayInfo | null;
  checkedInAtLabel: string | null; // arrival time (HH:MM) if checked in today
  leftFloor: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!shift) {
    return (
      <div className="bg-card text-muted-foreground flex items-center gap-2.5 rounded-xl border p-4 text-sm">
        <CalendarX className="size-4 shrink-0" />
        You don&apos;t have a shift today.
      </div>
    );
  }

  function markEntry() {
    start(async () => {
      const res = await checkIn(meId);
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success("Entry marked. You're on the floor.");
      router.refresh();
    });
  }

  return (
    <div className="border-primary bg-primary/5 flex flex-col gap-3 rounded-2xl border p-5">
      <span className="text-primary flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
        <CalendarCheck className="size-3.5" /> Your shift today
      </span>
      <p className="text-2xl font-bold">
        {shift.label}
        <span className="text-muted-foreground ml-2 text-base font-medium tabular-nums">
          {shift.start} – {shift.end}
        </span>
      </p>
      {checkedInAtLabel ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <CheckCircle2 className="size-4" />
          {leftFloor
            ? `Left the floor · entry was at ${checkedInAtLabel}`
            : `Entry marked at ${checkedInAtLabel}`}
        </p>
      ) : (
        <Button size="lg" className="w-full" disabled={pending} onClick={markEntry}>
          <LogIn className="mr-1.5 size-4" /> Mark entry
        </Button>
      )}
    </div>
  );
}
