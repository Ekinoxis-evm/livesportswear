import { createServerClient } from "@/lib/supabase/server";
import {
  normalizeWeekStart,
  currentWeekStart,
  weekDays,
  addDays,
} from "@/lib/scheduling/week";
import { sprintRange } from "@/lib/scheduling/payroll";
import { shiftDurationMinutes } from "@/lib/scheduling/conflicts";
import { validateSchedule, biweeklyHourWarnings } from "@/lib/scheduling/rules";
import { SPRINT_ANCHOR_MONDAY, BIWEEKLY_HOUR_CAP } from "@/lib/payroll-config";
import type { Violation } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScheduleControls } from "@/components/schedule/schedule-controls";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";
import { ViolationsBanner } from "@/components/schedule/violations-banner";
import { PublishButton } from "@/components/schedule/publish-button";

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerClient();

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, active")
    .order("name");
  const activeLocations = (locationRows ?? [])
    .filter((l) => l.active)
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
    const sprint = sprintRange(SPRINT_ANCHOR_MONDAY, weekStart);
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
        cap: BIWEEKLY_HOUR_CAP,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
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

      {schedule && <ViolationsBanner violations={violations} />}

      <ScheduleGrid
        scheduleId={schedule?.id ?? null}
        locationId={locationId}
        weekStart={weekStart}
        days={days}
        employees={empList}
        templates={templates ?? []}
        shifts={shiftRows}
        hoursByEmployee={hoursByEmployee}
      />
    </div>
  );
}
