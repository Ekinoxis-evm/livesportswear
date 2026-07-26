import { createServerClient } from "@/lib/supabase/server";
import { accessibleLocationIds } from "@/lib/auth";
import Link from "next/link";
import {
  normalizeWeekStart,
  weekDays,
  addDays,
  formatWeekRange,
} from "@/lib/scheduling/week";
import { businessDate } from "@/lib/business-date";
import { sprintRange } from "@/lib/scheduling/payroll";
import { shiftDurationMinutes } from "@/lib/scheduling/conflicts";
import { validateSchedule, biweeklyHourWarnings } from "@/lib/scheduling/rules";
import {
  accumulatedShiftCounts,
  weekdayShiftGrid,
} from "@/lib/scheduling/shift-grid";
import { ShiftCountGrid } from "@/components/schedule/shift-count-grid";
import { AllTimeShifts } from "@/components/schedule/all-time-shifts";
import { getPayPeriod } from "@/lib/payroll-config";
import type { Violation } from "@/types/domain";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScheduleControls } from "@/components/schedule/schedule-controls";
import { ScheduleWorkspace } from "@/components/schedule/schedule-workspace";
import { ViolationsBanner } from "@/components/schedule/violations-banner";
import { PublishButton } from "@/components/schedule/publish-button";
import { ResendEmailMenu } from "@/components/schedule/resend-email-menu";
import { CopyButton } from "@/components/shared/copy-button";
import { shortDateRange } from "@/lib/format-date";

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
    .select("id, name, active, timezone, share_token")
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
  // Current week anchored to the selected store's timezone, not the server's UTC.
  const selectedLocation = (locationRows ?? []).find((l) => l.id === locationId);
  const locTz = selectedLocation?.timezone ?? "UTC";
  const shareToken = selectedLocation?.share_token ?? null;
  const thisWeekStart = weekDays(businessDate(locTz))[0];
  const nextWeekStart = addDays(thisWeekStart, 7);
  const weekStart = normalizeWeekStart(sp.week, thisWeekStart);
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
      "id, name, role, avatar_color, weekly_hour_target, max_days_per_week, weekly_days_off",
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

  // Every shift ever scheduled at this store — for the all-time views. `date`
  // powers the by-weekday bucketing; `start_time` the AM/PM split.
  const { data: allShiftRows } = await supabase
    .from("shifts")
    .select("employee_id, start_time, date, schedules!inner(location_id)")
    .eq("schedules.location_id", locationId);
  const accumulatedShifts = (allShiftRows ?? []).map((s) => ({
    employee_id: s.employee_id,
    start_time: s.start_time,
    date: s.date,
    end_time: "",
    shift_template_id: null,
  }));

  const empList = employees ?? [];
  const empIds = empList.map((e) => e.id);
  const { data: timeOff } =
    empIds.length > 0
      ? await supabase
          .from("time_off_requests")
          .select("id, employee_id, start_date, end_date, status")
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
    id: string;
    employee_id: string;
    date: string;
    status: "approved" | "pending";
  }[] = [];
  const addOff = (
    id: string,
    empId: string,
    start: string,
    end: string,
    status: "approved" | "pending",
  ) => {
    for (const d of days) {
      if (d >= start && d <= end) {
        daysOff.push({ id, employee_id: empId, date: d, status });
      }
    }
  };
  for (const r of timeOff ?? []) addOff(r.id, r.employee_id, r.start_date, r.end_date, "approved");
  for (const r of pending) addOff(r.id, r.employee_id, r.start_date, r.end_date, "pending");

  // Draft schedules in progress (so work-in-progress is easy to find & resume).
  const locNameById = new Map((locationRows ?? []).map((l) => [l.id, l.name]));
  const { data: draftRows } = await supabase
    .from("schedules")
    .select("location_id, week_start, shifts(count)")
    .eq("status", "draft");
  const drafts = (draftRows ?? [])
    .map((d) => ({
      location_id: d.location_id,
      week_start: d.week_start,
      count: (d.shifts as { count: number }[] | null)?.[0]?.count ?? 0,
    }))
    .filter(
      (d) =>
        d.count > 0 && (access === "all" || access.includes(d.location_id)),
    )
    .sort((a, b) => b.week_start.localeCompare(a.week_start));

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
            {schedule.status === "published" && shareToken && (
              <CopyButton
                value={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/w/${shareToken}/${weekStart}`}
                label="Copy share link"
              />
            )}
            {schedule.status === "published" && (
              <ResendEmailMenu
                scheduleId={schedule.id}
                recipients={empList
                  .filter((e) => shiftRows.some((s) => s.employee_id === e.id))
                  .map((e) => ({ id: e.id, name: e.name }))
                  .sort((a, b) => a.name.localeCompare(b.name))}
              />
            )}
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
        thisWeek={thisWeekStart}
        nextWeek={nextWeekStart}
      />

      {drafts.length > 0 && (
        <div className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Drafts in progress
          </span>
          <div className="flex flex-wrap gap-2">
            {drafts.map((d) => {
              const isCurrent =
                d.location_id === locationId && d.week_start === weekStart;
              return (
                <Link
                  key={`${d.location_id}-${d.week_start}`}
                  href={`/admin/schedules?location=${d.location_id}&week=${d.week_start}`}
                  className={
                    "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                    (isCurrent
                      ? "border-primary bg-primary/10"
                      : "hover:bg-muted bg-background")
                  }
                >
                  <span className="font-medium">{locNameById.get(d.location_id) ?? "—"}</span>{" "}
                  <span className="text-muted-foreground tabular-nums">
                    {formatWeekRange(d.week_start)} · {d.count} shift
                    {d.count === 1 ? "" : "s"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

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
                  · {shortDateRange(r.start_date, r.end_date)}
                  {r.reason ? ` · ${r.reason}` : ""}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-2 text-xs">
              Approve or reject these on the board below (Next week).
            </p>
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

      {shiftRows.length > 0 && (
        <ShiftCountGrid
          rows={accumulatedShiftCounts(
            shiftRows,
            empList.map((e) => ({ id: e.id, name: e.name })),
          )}
        />
      )}

      {accumulatedShifts.length > 0 && (
        <AllTimeShifts
          totals={accumulatedShiftCounts(
            accumulatedShifts,
            empList.map((e) => ({ id: e.id, name: e.name })),
          )}
          weekday={weekdayShiftGrid(
            accumulatedShifts,
            empList.map((e) => ({ id: e.id, name: e.name })),
          )}
          colorById={new Map(empList.map((e) => [e.id, e.avatar_color]))}
        />
      )}
    </div>
  );
}
