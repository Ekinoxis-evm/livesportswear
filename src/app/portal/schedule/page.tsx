import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  weekStart,
  weekDays,
  addDays,
  isoWeekday,
  formatWeekRange,
} from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { googleCalendarUrl, webcalUrl } from "@/lib/calendar-links";
import { ScheduleView, type DayCell } from "@/components/portal/schedule-view";
import { RequestDayOff } from "@/components/portal/request-day-off";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { CopyButton } from "@/components/shared/copy-button";

const hhmm = (t: string) => t.slice(0, 5);

type MyShiftRow = {
  date: string;
  start_time: string;
  end_time: string;
  template: { name: string } | null;
};

export default async function SchedulePage() {
  const { employee } = await requireEmployee();
  const supabase = await createServerClient();
  const service = createServiceClient();

  const today = new Date().toISOString().slice(0, 10);
  const ws = weekStart(today);
  const weekDates = weekDays(ws);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const { data: location } = await supabase
    .from("locations")
    .select("name, address, timezone")
    .eq("id", employee.location_id)
    .maybeSingle();
  const tz = location?.timezone ?? "UTC";
  const locName = location?.name ?? "Live Active Wear";

  const { data: mineData } = await supabase
    .from("shifts")
    .select(
      "date, start_time, end_time, template:shift_templates(name), schedules!inner(status)",
    )
    .eq("employee_id", employee.id)
    .eq("schedules.status", "published")
    .gte("date", ws)
    .lte("date", addDays(ws, 6))
    .order("date");
  const mine = (mineData ?? []) as MyShiftRow[];
  const myByDate = new Map<string, MyShiftRow[]>();
  for (const s of mine) {
    const arr = myByDate.get(s.date) ?? [];
    arr.push(s);
    myByDate.set(s.date, arr);
  }

  const { data: storeShiftRows } = await service
    .from("shifts")
    .select(
      "date, start_time, end_time, employee_id, employees!inner(name), schedules!inner(status, location_id, week_start)",
    )
    .eq("schedules.location_id", employee.location_id)
    .eq("schedules.status", "published")
    .eq("schedules.week_start", ws)
    .order("start_time");

  const scheduleDays: DayCell[] = weekDates.map((d) => ({
    date: d,
    weekday: SHORT_WEEKDAYS[isoWeekday(d) - 1],
    dayNum: d.slice(8, 10),
    isToday: d === today,
    mine: (myByDate.get(d) ?? [])
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map((s) => {
        const name = s.template?.name ?? "Shift";
        return {
          time: `${hhmm(s.start_time)}–${hhmm(s.end_time)}`,
          title: name,
          gcal: googleCalendarUrl({
            title: `${name} · ${locName}`,
            date: s.date,
            start: s.start_time,
            end: s.end_time,
            tz,
            location: location?.address ?? locName,
          }),
        };
      }),
    store: (storeShiftRows ?? [])
      .filter((r) => r.date === d)
      .map((r) => ({
        name: (r.employees as { name: string } | null)?.name ?? "—",
        time: `${hhmm(r.start_time)}–${hhmm(r.end_time)}`,
        isMe: r.employee_id === employee.id,
      })),
  }));
  const weekLabel = formatWeekRange(ws);
  const icsUrl = `${appUrl}/s/${employee.magic_token}/calendar.ics`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Schedule</h1>
        <p className="text-muted-foreground text-sm">{locName}</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">This week</CardTitle>
            <CardDescription>Yours and the store.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <RequestDayOff />
            <a href={webcalUrl(icsUrl)} className={buttonVariants({ size: "sm" })}>
              Subscribe
            </a>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ScheduleView days={scheduleDays} weekLabel={weekLabel} />
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span>Google Calendar (whole schedule): add this URL under “From URL”.</span>
            <CopyButton value={icsUrl} label="Copy feed URL" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
