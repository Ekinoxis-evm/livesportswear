import { createServerClient } from "@/lib/supabase/server";
import {
  normalizeWeekStart,
  currentWeekStart,
  weekDays,
} from "@/lib/scheduling/week";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScheduleControls } from "@/components/schedule/schedule-controls";
import { ScheduleGrid } from "@/components/schedule/schedule-grid";

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
    .select("id, name, avatar_color")
    .eq("location_id", locationId)
    .eq("active", true)
    .order("name");

  const { data: templates } = await supabase
    .from("shift_templates")
    .select("id, name, start_time, end_time, color")
    .eq("location_id", locationId)
    .eq("active", true)
    .order("start_time");

  let shiftRows: {
    id: string;
    employee_id: string;
    date: string;
    shift_template_id: string | null;
    start_time: string;
    end_time: string;
    notes: string | null;
  }[] = [];
  if (schedule) {
    const { data } = await supabase
      .from("shifts")
      .select(
        "id, employee_id, date, shift_template_id, start_time, end_time, notes",
      )
      .eq("schedule_id", schedule.id);
    shiftRows = data ?? [];
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
        {schedule && (
          <Badge variant={schedule.status === "published" ? "default" : "secondary"}>
            {schedule.status === "published" ? "Published" : "Draft"}
          </Badge>
        )}
      </div>

      <ScheduleControls
        locations={activeLocations}
        locationId={locationId}
        weekStart={weekStart}
      />

      <ScheduleGrid
        scheduleId={schedule?.id ?? null}
        locationId={locationId}
        weekStart={weekStart}
        days={days}
        employees={employees ?? []}
        templates={templates ?? []}
        shifts={shiftRows}
      />
    </div>
  );
}
