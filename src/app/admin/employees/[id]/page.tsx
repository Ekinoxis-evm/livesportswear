import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { weekStart, weekDays, addDays, isoWeekday } from "@/lib/scheduling/week";
import { employeeStats, type StatShift } from "@/lib/scheduling/stats";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/shared/copy-button";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hhmm = (t: string) => t.slice(0, 5);

const ROLE_LABELS: Record<string, string> = {
  sales_rep: "Sales rep",
  shift_lead: "Shift lead",
  store_manager: "Store manager",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("*, location:locations(name)")
    .eq("id", id)
    .maybeSingle();
  if (!emp) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const wkStart = weekStart(today);
  const thisWeek = new Set(weekDays(wkStart));
  const month = today.slice(0, 7);

  const { data: shiftData } = await supabase
    .from("shifts")
    .select("employee_id, date, start_time, end_time, shift_template_id, template:shift_templates(name)")
    .eq("employee_id", id)
    .gte("date", addDays(today, -35))
    .lte("date", addDays(today, 40))
    .order("date");
  const shifts = (shiftData ?? []) as (StatShift & {
    template: { name: string } | null;
  })[];

  const weekStats = employeeStats(
    shifts.filter((s) => thisWeek.has(s.date)),
    id,
  );
  const monthStats = employeeStats(
    shifts.filter((s) => s.date.slice(0, 7) === month),
    id,
  );
  const upcoming = shifts.filter((s) => s.date >= today).slice(0, 8);

  const scheduleUrl = `${appUrl}/s/${emp.magic_token}`;
  const icsUrl = `${scheduleUrl}/calendar.ics`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/employees"
            className="text-muted-foreground text-sm hover:underline"
          >
            ← Employees
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {emp.name}
          </h1>
          <p className="text-muted-foreground text-sm">
            {ROLE_LABELS[emp.role] ?? emp.role} ·{" "}
            {(emp.location as { name: string } | null)?.name ?? "—"} · {emp.email}
          </p>
        </div>
        <Badge variant={emp.active ? "default" : "secondary"}>
          {emp.active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This week</CardTitle>
            <CardDescription>
              Target {emp.weekly_hour_target}h · ≤{emp.max_days_per_week} days
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-8">
            <Stat label="Hours" value={`${weekStats.totalHours.toFixed(1)}h`} />
            <Stat label="Days" value={String(weekStats.daysWorked)} />
            <Stat
              label="Avg shift"
              value={`${weekStats.avgShiftHours.toFixed(1)}h`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">This month</CardTitle>
            <CardDescription>{month}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-8">
            <Stat label="Hours" value={`${monthStats.totalHours.toFixed(1)}h`} />
            <Stat label="Days" value={String(monthStats.daysWorked)} />
            <Stat label="Shifts" value={String(monthStats.shiftCount)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm">No upcoming shifts.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {upcoming.map((s, i) => (
                <li
                  key={`${s.date}-${i}`}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="tabular-nums">
                    {WD[isoWeekday(s.date) - 1]} {s.date}
                  </span>
                  <span className="text-muted-foreground">
                    {s.template?.name ?? "Shift"} · {hhmm(s.start_time)}–
                    {hhmm(s.end_time)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal links</CardTitle>
          <CardDescription>
            Share the schedule page; the calendar URL is for subscribing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground truncate text-sm">
              {appUrl}/s/{"•".repeat(8)}
            </span>
            <CopyButton value={scheduleUrl} label="Schedule link" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground truncate text-sm">
              {appUrl}/s/{"•".repeat(8)}/calendar.ics
            </span>
            <CopyButton value={icsUrl} label="Calendar link" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
