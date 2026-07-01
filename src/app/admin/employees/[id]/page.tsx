import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { weekStart, weekDays, addDays, isoWeekday } from "@/lib/scheduling/week";
import { businessDate } from "@/lib/business-date";
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
import { EmployeeAccessActions } from "@/components/employee/account-actions";
import { AdminRoleActions } from "@/components/employee/admin-role-actions";
import { SetPasswordButton } from "@/components/employee/set-password-button";
import { getEmployeeAuthRole } from "@/server/employee-accounts";
import { formatMoney } from "@/lib/commission";

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
    .select("*, location:locations(name, timezone)")
    .eq("id", id)
    .maybeSingle();
  if (!emp) notFound();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const empTz =
    (emp.location as { timezone: string } | null)?.timezone ?? "UTC";
  const today = businessDate(empTz);
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

  const { data: comp } = await supabase
    .from("employee_compensation")
    .select("hourly_rate")
    .eq("employee_id", id)
    .maybeSingle();
  const hourlyRate = comp?.hourly_rate ?? null;
  const monthLaborCost =
    hourlyRate != null ? monthStats.totalHours * hourlyRate : null;

  const { data: cfg } = await supabase
    .from("commission_config")
    .select("currency")
    .eq("id", 1)
    .maybeSingle();
  const currency = cfg?.currency ?? "USD";

  const authRole = emp.auth_user_id ? await getEmployeeAuthRole(emp.id) : null;

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
          <CardTitle className="text-base">Portal &amp; pay</CardTitle>
          <CardDescription>Private — visible to admins only.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-sm">Employee portal access</span>
              <span className="text-muted-foreground text-xs">
                {emp.auth_user_id
                  ? "Has a login to see their schedule & stats."
                  : "Invite to give them an email + password login."}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <SetPasswordButton id={emp.id} name={emp.name} />
              <EmployeeAccessActions
                id={emp.id}
                linked={Boolean(emp.auth_user_id)}
              />
            </div>
          </div>
          {emp.auth_user_id && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-sm">Admin access</span>
                <span className="text-muted-foreground text-xs">
                  {authRole === "admin"
                    ? "Full access to every location, schedule & pay. Takes effect next time they sign in."
                    : "Grant full admin access. Takes effect next time they sign in."}
                </span>
              </div>
              <AdminRoleActions id={emp.id} isAdmin={authRole === "admin"} />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">Hourly rate</span>
            <span className="text-sm tabular-nums">
              {hourlyRate != null ? `${formatMoney(hourlyRate, currency)} / h` : "—"}
              <span className="text-muted-foreground ml-2 text-xs">
                edit via the employee list
              </span>
            </span>
          </div>
          {monthLaborCost != null && (
            <p className="text-muted-foreground text-sm tabular-nums">
              Est. labor cost this month: {formatMoney(monthLaborCost, currency)}{" "}
              ({monthStats.totalHours.toFixed(1)}h ×{" "}
              {formatMoney(hourlyRate ?? 0, currency)})
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Share links</CardTitle>
          <CardDescription>
            For sharing without a login — most employees just use the portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-sm">Public schedule page</span>
              <span className="text-muted-foreground text-xs">
                A no-login web page of their shifts.
              </span>
            </div>
            <CopyButton value={scheduleUrl} label="Copy" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-sm">Calendar feed (.ics)</span>
              <span className="text-muted-foreground text-xs">
                Subscribe in Apple / Google / Outlook calendar.
              </span>
            </div>
            <CopyButton value={icsUrl} label="Copy" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
