"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarOff } from "lucide-react";
import { updateOwnPreferredDaysOff } from "@/server/profile";
import { WEEKDAYS, shortWeekday } from "@/lib/weekdays";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DaysOffForm({ preferred }: { preferred: string[] }) {
  const router = useRouter();
  const [days, setDays] = useState<string[]>(preferred);
  const [pending, start] = useTransition();

  function toggle(day: string) {
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]));
  }

  function save() {
    start(async () => {
      const res = await updateOwnPreferredDaysOff(days);
      if (!res.ok) {
        toast.error(res.error ?? "Couldn't save your preferences.");
        return;
      }
      toast.success(days.length ? "Preferences saved." : "Preferences cleared.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base">
          <CalendarOff className="size-4" /> Preferred days off
        </CardTitle>
        <CardDescription>
          The scheduler tries to keep these free (a preference, not a
          guarantee). Clear them all if you have none.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((day) => {
            const on = days.includes(day);
            return (
              <Button
                key={day}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                onClick={() => toggle(day)}
                className={cn("w-12", on && "font-semibold")}
              >
                {shortWeekday(day)}
              </Button>
            );
          })}
        </div>
        <Button
          onClick={save}
          disabled={pending}
          className="self-end"
          variant="outline"
          size="sm"
        >
          {pending ? "Saving…" : "Save preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}
