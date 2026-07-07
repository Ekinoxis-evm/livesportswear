import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { weekStart, weekDays, addDays, isoWeekday, formatWeekRange } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { slotLabelForHours } from "@/lib/shift-slots";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const hhmm = (t: string) => t.slice(0, 5);

type ShiftRow = {
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  template: { name: string } | null;
  employee: { name: string } | null;
};

export default async function StoreWeekPage({
  params,
}: {
  params: Promise<{ token: string; week: string }>;
}) {
  const { token, week } = await params;
  if (!DATE_RE.test(week)) notFound();

  const supabase = createServiceClient();
  const { data: loc } = await supabase
    .from("locations")
    .select("id, name, timezone")
    .eq("share_token", token)
    .maybeSingle();
  if (!loc) notFound();

  // Any date in the week resolves to its Monday so shared links can't fragment.
  const monday = weekStart(week);
  if (monday !== week) redirect(`/w/${token}/${monday}`);

  const { data: schedule } = await supabase
    .from("schedules")
    .select("id")
    .eq("location_id", loc.id)
    .eq("week_start", monday)
    .eq("status", "published")
    .maybeSingle();

  let shifts: ShiftRow[] = [];
  if (schedule) {
    const { data } = await supabase
      .from("shifts")
      .select(
        "employee_id, date, start_time, end_time, template:shift_templates(name), employee:employees(name)",
      )
      .eq("schedule_id", schedule.id)
      .order("date")
      .order("start_time");
    shifts = (data ?? []) as ShiftRow[];
  }

  const days = weekDays(monday);
  const today = businessDate(loc.timezone);
  const thisWeek = weekStart(today);

  const label = (s: ShiftRow) =>
    s.template?.name ?? slotLabelForHours(s.start_time, s.end_time) ?? "Shift";

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            LIVE! · Team schedule
          </p>
          <h1 className="text-xl font-bold">{loc.name}</h1>
          <p className="text-muted-foreground text-sm tabular-nums">
            {formatWeekRange(monday)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/w/${token}/${addDays(monday, -7)}`}
            aria-label="Previous week"
            className="hover:bg-muted rounded-md border p-1.5"
          >
            <ChevronLeft className="size-4" />
          </Link>
          {monday !== thisWeek && (
            <Link
              href={`/w/${token}/${thisWeek}`}
              className="text-primary px-1 text-sm underline-offset-4 hover:underline"
            >
              This week
            </Link>
          )}
          <Link
            href={`/w/${token}/${addDays(monday, 7)}`}
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
        <div className="flex flex-col gap-3">
          {days.map((day) => {
            const dayShifts = shifts.filter((s) => s.date === day);
            const isToday = day === today;
            return (
              <Card key={day} className={isToday ? "border-primary" : undefined}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-baseline gap-2 text-sm">
                    {SHORT_WEEKDAYS[isoWeekday(day) - 1]}
                    <span className="text-muted-foreground text-xs font-normal tabular-nums">
                      {day}
                    </span>
                    {isToday && (
                      <span className="text-primary text-xs font-semibold uppercase">
                        Today
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dayShifts.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Nobody scheduled.</p>
                  ) : (
                    <ul className="flex flex-col divide-y">
                      {dayShifts.map((s, i) => (
                        <li
                          key={`${s.employee_id}-${i}`}
                          className="flex items-center justify-between py-1.5 text-sm"
                        >
                          <span className="font-medium">
                            {s.employee?.name ?? "—"}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {label(s)} · {hhmm(s.start_time)}–{hhmm(s.end_time)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
