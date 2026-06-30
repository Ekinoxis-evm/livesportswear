import { createServerClient } from "@/lib/supabase/server";
import { accessibleLocationIds } from "@/lib/auth";
import {
  normalizeWeekStart,
  currentWeekStart,
  weekDays,
  addDays,
} from "@/lib/scheduling/week";
import { sprintRange } from "@/lib/scheduling/payroll";
import { shiftDurationMinutes } from "@/lib/scheduling/conflicts";
import { validateSchedule, biweeklyHourWarnings } from "@/lib/scheduling/rules";
import { getPayPeriod } from "@/lib/payroll-config";
import type { Violation } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScheduleControls } from "@/components/schedule/schedule-controls";
import { ScheduleWorkspace } from "@/components/schedule/schedule-workspace";
import { ViolationsBanner } from "@/components/schedule/violations-banner";
import { PublishButton } from "@/components/schedule/publish-button";

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerClient();
  const { anchor: sprintAnchor, cap: biweeklyCap } = await getPayPeriod();

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, active")
    .order("name");
  const access = await accessibleLocationIds();
  const activeLocations = (locationRows ?? [])
    .filter((l) => l.active && (access === "all" || access.includes(l.id)))
    .map((l) => ({ id: l.id, name: l.name }));

  if (activeLocations.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
        <Alert>
          <AlertTitle>Add a location first</AlertTitle>
          <AlertDescription>
            Create an active location, then add employees and shift templates to
            start scheduling.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const locationId =
    activeLocations.find((l) => l.id === sp.location)?.id ??
    activeLocations[0].id;
  const weekStart = normalizeWeekStart(sp.week, currentWeekStart());
  const days = weekDays(weekStart);

  const { data: schedule } = await supabase
    .from("schedules")
    .select("id, status")
    .eq("location_id", locationId)
    .eq("week_start", weekStart)
    .maybeSingle();

  const { data: employees } = await supabase
    .from("employees")
    .select(
      "id, name, avatar_color, weekly_hour_target, max_days_per_week, weekly_days_off, preferred_days_off",
    )
    .eq("location_id", locationId)
    .eq("active", true)
    .order("name");

  const { data: templates } = await supabase
    .from("shift_templates")
    .select("id, name, start_time, end_time, color, default_headcount")
    .eq("location_id", locationId)
    .eq("active", true)
    .order("start_time");

  type ShiftRow = {
    id: string;
    employee_id: string;
    date: string;
    shift_template_id: string | null;
    start_time: string;
    end_time: string;
    notes: string | null;
  };
  let shiftRows: ShiftRow[] = [];
  if (schedule) {
    const { data } = await supabase
      .from("shifts")
      .select(
        "id, employee_id, date, shift_template_id, start_time, end_time, notes",
      )
      .eq("schedule_id", schedule.id);
    shiftRows = data ?? [];
  }

  const empList = employees ?? [];
  const empIds = empList.map((e) => e.id);
  const { data: timeOff } =
    empIds.length > 0
      ? await supabase
          .from("time_off_requests")
          .select("employee_id, start_date, end_date, status")
          .in("employee_id", empIds)
          .eq("status", "approved")
      : { data: [] };

  // Pending day-off requests overlapping the displayed week — what the admin
  // needs to see when building this week (and especially next week).
  const weekEnd = days[days.length - 1];
  const nameById = new Map(empList.map((e) => [e.id, e.name]));
  const { data: pendingOff } =
    empIds.length > 0
      ? await supabase
          .from("time_off_requests")
          .select("id, employee_id, start_date, end_date, reason")
          .in("employee_id", empIds)
          .eq("status", "pending")
          .lte("start_date", weekEnd)
          .gte("end_date", weekStart)
          .order("start_date")
      : { data: [] };
  const pending = pendingOff ?? [];

  // Per-day off markers for the grid/board (approved = solid, pending = requested).
  const daysOff: {
    employee_id: string;
    date: string;
    status: "approved" | "pending";
  }[] = [];
  const addOff = (
    empId: string,
    start: string,
    end: string,
    status: "approved" | "pending",
  ) => {
    for (const d of days) {
      if (d >= start && d <= end) daysOff.push({ employee_id: empId, date: d, status });
    }
  };
  for (const r of timeOff ?? []) addOff(r.employee_id, r.start_date, r.end_date, "approved");
  for (const r of pending) addOff(r.employee_id, r.start_date, r.end_date, "pending");

  // Weekly hours per employee (for the grid).
  const hoursByEmployee: Record<string, number> = {};
  for (const s of shiftRows) {
    hoursByEmployee[s.employee_id] =
      (hoursByEmployee[s.employee_id] ?? 0) +
      shiftDurationMinutes(s.start_time, s.end_time) / 60;
  }

  let violations: Violation[] = [];
  if (schedule) {
    violations = validateSchedule({
      schedule: { week_start: weekStart },
      shifts: shiftRows,
      employees: empList,
      timeOff: timeOff ?? [],
      templates: templates ?? [],
    });

    // 80h-per-sprint cap spans both weeks of the pay sprint.
    const sprint = sprintRange(sprintAnchor, weekStart);
    const sprintWeeks = [sprint.start, addDays(sprint.start, 7)];
    const { data: sprintShifts } = await supabase
      .from("shifts")
      .select(
        "employee_id, start_time, end_time, schedules!inner(location_id, week_start)",
      )
      .eq("schedules.location_id", locationId)
      .in("schedules.week_start", sprintWeeks);

    violations = violations.concat(
      biweeklyHourWarnings({
        employees: empList,
        sprintShifts: sprintShifts ?? [],
        cap: biweeklyCap,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
        {schedule && (
          <div className="flex items-center gap-3">
            <Badge
              variant={
                schedule.status === "published" ? "default" : "secondary"
              }
            >
              {schedule.status === "published" ? "Published" : "Draft"}
            </Badge>
            <PublishButton
              scheduleId={schedule.id}
              blockers={violations.filter((v) => v.level === "block").length}
              published={schedule.status === "published"}
            />
          </div>
        )}
      </div>

      <ScheduleControls
        locations={activeLocations}
        locationId={locationId}
        weekStart={weekStart}
      />

      {pending.length > 0 && (
        <Alert>
          <AlertTitle>
            {pending.length} day-off request{pending.length > 1 ? "s" : ""} for this
            week
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 flex flex-col gap-0.5">
              {pending.map((r) => (
                <li key={r.id} className="text-sm tabular-nums">
                  <span className="font-medium">
                    {nameById.get(r.employee_id) ?? "—"}
                  </span>{" "}
                  · {r.start_date === r.end_date ? r.start_date : `${r.start_date} → ${r.end_date}`}
                  {r.reason ? ` · ${r.reason}` : ""}
                </li>
              ))}
            </ul>
            <a href="/admin/time-off" className="text-primary mt-2 inline-block text-sm underline">
              Review in Time off →
            </a>
          </AlertDescription>
        </Alert>
      )}

      {schedule && <ViolationsBanner violations={violations} />}

      <ScheduleWorkspace
        scheduleId={schedule?.id ?? null}
        locationId={locationId}
        weekStart={weekStart}
        days={days}
        employees={empList}
        templates={templates ?? []}
        shifts={shiftRows}
        hoursByEmployee={hoursByEmployee}
        daysOff={daysOff}
      />
    </div>
  );
}
