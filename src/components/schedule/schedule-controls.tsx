"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, currentWeekStart, formatWeekRange } from "@/lib/scheduling/week";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ScheduleControls({
  locations,
  locationId,
  weekStart,
}: {
  locations: { id: string; name: string }[];
  locationId: string;
  weekStart: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(next: { location?: string; week?: string }) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next.location) sp.set("location", next.location);
    if (next.week) sp.set("week", next.week);
    router.push(`/admin/schedules?${sp.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Select
        value={locationId}
        onValueChange={(v) => v && go({ location: v })}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Select location" />
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous week"
          onClick={() => go({ week: addDays(weekStart, -7) })}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-40 text-center text-sm font-medium tabular-nums">
          {formatWeekRange(weekStart)}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next week"
          onClick={() => go({ week: addDays(weekStart, 7) })}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => go({ week: currentWeekStart() })}
        >
          This week
        </Button>
      </div>
    </div>
  );
}
