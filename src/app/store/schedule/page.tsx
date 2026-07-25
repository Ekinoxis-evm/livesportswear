import Link from "next/link";
import { ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import {
  addDays,
  isoWeekday,
  normalizeWeekStart,
  weekDays,
  weekStart,
  formatWeekRange,
} from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS, weekdayName } from "@/lib/weekdays";
import { SHIFT_SLOTS, templateForSlot, shiftMatchesSlot } from "@/lib/shift-slots";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

const hhmm = (t: string) => t.slice(0, 5);

// Same fallback colors as the admin board's slot rows.
const SLOT_COLOR: Record<string, string> = {
  morning: "#22c55e",
  evening: "#a855f7",
};

type ShiftRow = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_template_id: string | null;
  employee: { name: string; role: string; avatar_color: string | null } | null;
};

function Chip({ shift, withTime }: { shift: ShiftRow; withTime?: boolean }) {
  return (
    <span className="bg-muted flex items-center gap-1 rounded-md px-2 py-1 text-xs">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full border"
        style={{ backgroundColor: shift.employee?.avatar_color ?? "transparent" }}
      />
      {shift.employee?.role === "store_manager" && (
        <Crown className="size-3 shrink-0 text-amber-500" />
      )}
      <span className="truncate">{shift.employee?.name ?? "—"}</span>
      {withTime && (
        <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
          {hhmm(shift.start_time)}–{hhmm(shift.end_time)}
        </span>
      )}
    </span>
  );
}

export default async function StoreSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const { locationId } = await requireStore();
  const service = createServiceClient();

  const { data: loc } = await service
    .from("locations")
    .select("timezone")
    .eq("id", locationId)
    .maybeSingle();
  const tz = loc?.timezone ?? "UTC";
  const bd = businessDate(tz);
  const thisWeek = weekStart(bd);
  const view: "today" | "week" = sp.view === "week" ? "week" : "today";
  const ws = normalizeWeekStart(sp.week, thisWeek);

  const pill = (active: boolean) =>
    cn(
      "rounded-full border px-4 py-1.5 text-sm font-medium",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
    );

  // Every Link here is prefetch={false}, like the kiosk nav: the 45s
  // AutoRefresh re-prefetched all of them each cycle, and since several point
  // back at this same dynamic route it logged 364 renders a day against ~92 for
  // the other kiosk tabs.
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">Schedule</h1>
      <div className="flex gap-2">
        <Link href="/store/schedule" prefetch={false} className={pill(view === "today")}>
          Today
        </Link>
        <Link href="/store/schedule?view=week" prefetch={false} className={pill(view === "week")}>
          Week
        </Link>
      </div>
    </div>
  );

  if (view === "today") {
    const { data: todayRows } = await service
      .from("shifts")
      .select(
        "employee_id, date, start_time, end_time, shift_template_id, employee:employees(name, role, avatar_color), schedules!inner(status, location_id)",
      )
      .eq("date", bd)
      .eq("schedules.status", "published")
      .eq("schedules.location_id", locationId)
      .order("start_time");
    const shifts = (todayRows ?? []) as unknown as ShiftRow[];

    return (
      <div className="flex flex-col gap-5">
        {header}
        <p className="text-muted-foreground text-sm">
          {weekdayName(bd)} · <span className="tabular-nums">{bd}</span>
        </p>
        <Card>
          <CardContent className="pt-6">
            {shifts.length === 0 ? (
              <p className="text-muted-foreground py-4 text-sm">
                Nobody is scheduled today.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {shifts.map((s, i) => (
                  <li key={`${s.employee_id}-${i}`} className="flex items-center gap-3 py-3">
                    <span className="flex min-w-0 items-center gap-2 text-lg font-semibold">
                      {s.employee?.role === "store_manager" && (
                        <Crown className="size-4 shrink-0 text-amber-500" />
                      )}
                      <span className="truncate">{s.employee?.name ?? "—"}</span>
                    </span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-base tabular-nums">
                      {hhmm(s.start_time)} – {hhmm(s.end_time)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Week view — the published grid, same shape as the public store-week page.
  const [{ data: schedule }, { data: templateRows }] = await Promise.all([
    service
      .from("schedules")
      .select("id")
      .eq("location_id", locationId)
      .eq("week_start", ws)
      .eq("status", "published")
      .maybeSingle(),
    service
      .from("shift_templates")
      .select("id, name, start_time, end_time, color")
      .eq("location_id", locationId)
      .eq("active", true),
  ]);
  const templates = templateRows ?? [];

  let shifts: ShiftRow[] = [];
  if (schedule) {
    const { data } = await service
      .from("shifts")
      .select(
        "employee_id, date, start_time, end_time, shift_template_id, employee:employees(name, role, avatar_color)",
      )
      .eq("schedule_id", schedule.id)
      .order("date")
      .order("start_time");
    shifts = (data ?? []) as unknown as ShiftRow[];
  }

  const days = weekDays(ws);
  const slots = SHIFT_SLOTS.map((slot) => ({ slot, tpl: templateForSlot(slot, templates) }));
  const inAnySlot = (s: ShiftRow) =>
    slots.some(({ slot, tpl }) => shiftMatchesSlot(s, slot, tpl));
  const otherShifts = shifts.filter((s) => !inAnySlot(s));

  const weekHref = (w: string) => `/store/schedule?view=week&week=${w}`;

  return (
    <div className="flex flex-col gap-5">
      {header}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm tabular-nums">{formatWeekRange(ws)}</p>
        <div className="flex items-center gap-1">
          <Link
            href={weekHref(addDays(ws, -7))}
            prefetch={false}
            aria-label="Previous week"
            className="hover:bg-muted rounded-md border p-1.5"
          >
            <ChevronLeft className="size-4" />
          </Link>
          {ws !== thisWeek && (
            <Link
              href={weekHref(thisWeek)}
              prefetch={false}
              className="px-1 text-sm underline-offset-4 hover:underline"
            >
              This week
            </Link>
          )}
          <Link
            href={weekHref(addDays(ws, 7))}
            prefetch={false}
            aria-label="Next week"
            className="hover:bg-muted rounded-md border p-1.5"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      {!schedule ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            This week hasn&apos;t been published yet.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="bg-muted/50 sticky left-0 z-10 p-2 text-left font-medium">
                  Shift
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    className={cn(
                      "min-w-28 p-2 text-left font-medium",
                      d === bd && "text-primary",
                    )}
                  >
                    <span className="text-muted-foreground">
                      {SHORT_WEEKDAYS[isoWeekday(d) - 1]}
                    </span>{" "}
                    <span className="tabular-nums">{d.slice(8, 10)}</span>
                    {d === bd && (
                      <span className="text-primary ml-1 text-[10px] font-semibold uppercase">
                        Today
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map(({ slot, tpl }) => {
                const color = tpl?.color ?? SLOT_COLOR[slot.key] ?? "var(--color-primary)";
                return (
                  <tr key={slot.key} className="border-t align-top">
                    <td className="bg-background sticky left-0 z-10 p-2">
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          aria-hidden
                          className="h-4 w-1 rounded"
                          style={{ backgroundColor: color }}
                        />
                        <span className="flex flex-col">
                          {slot.label}
                          <span className="text-muted-foreground text-xs font-normal tabular-nums">
                            {slot.start}–{slot.end}
                          </span>
                        </span>
                      </span>
                    </td>
                    {days.map((d) => {
                      const assigned = shifts.filter(
                        (s) => s.date === d && shiftMatchesSlot(s, slot, tpl),
                      );
                      return (
                        <td
                          key={d}
                          className={cn(
                            "border-l p-1.5 align-top",
                            d === bd && "bg-primary/5",
                          )}
                        >
                          <div className="flex flex-col gap-1">
                            {assigned.map((s, i) => (
                              <Chip key={`${s.employee_id}-${i}`} shift={s} />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {otherShifts.length > 0 && (
                <tr className="border-t align-top">
                  <td className="bg-background sticky left-0 z-10 p-2">
                    <span className="flex items-center gap-2 font-medium">
                      <span aria-hidden className="bg-muted-foreground h-4 w-1 rounded" />
                      Other
                    </span>
                  </td>
                  {days.map((d) => (
                    <td
                      key={d}
                      className={cn(
                        "border-l p-1.5 align-top",
                        d === bd && "bg-primary/5",
                      )}
                    >
                      <div className="flex flex-col gap-1">
                        {otherShifts
                          .filter((s) => s.date === d)
                          .map((s, i) => (
                            <Chip key={`${s.employee_id}-${i}`} shift={s} withTime />
                          ))}
                      </div>
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
