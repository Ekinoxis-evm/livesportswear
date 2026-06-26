import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { weekStart, weekDays, addDays, isoWeekday } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { employeeStats, type StatShift } from "@/lib/scheduling/stats";
import {
  commissionFor,
  formatMoney,
  type CommissionTier,
} from "@/lib/commission";
import { googleCalendarUrl, webcalUrl } from "@/lib/calendar-links";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { PhotoUpload } from "@/components/portal/photo-upload";
import { CopyButton } from "@/components/shared/copy-button";

const hhmm = (t: string) => t.slice(0, 5);

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export default async function PortalPage() {
  const { employee } = await requireEmployee();
  const supabase = await createServerClient();

  const today = new Date().toISOString().slice(0, 10);
  const thisWeek = new Set(weekDays(weekStart(today)));
  const month = today.slice(0, 7);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const { data: location } = await supabase
    .from("locations")
    .select("name, address, timezone")
    .eq("id", employee.location_id)
    .maybeSingle();
  const tz = location?.timezone ?? "UTC";
  const locName = location?.name ?? "Live Active Wear";

  const { data: shiftData } = await supabase
    .from("shifts")
    .select(
      "id, employee_id, date, start_time, end_time, shift_template_id, template:shift_templates(name), schedules!inner(status)",
    )
    .eq("employee_id", employee.id)
    .eq("schedules.status", "published")
    .gte("date", addDays(today, -35))
    .lte("date", addDays(today, 40))
    .order("date");
  const shifts = (shiftData ?? []) as (StatShift & {
    id: string;
    template: { name: string } | null;
  })[];

  const weekStats = employeeStats(
    shifts.filter((s) => thisWeek.has(s.date)),
    employee.id,
  );
  const monthStats = employeeStats(
    shifts.filter((s) => s.date.slice(0, 7) === month),
    employee.id,
  );
  const upcoming = shifts.filter((s) => s.date >= today).slice(0, 10);

  // Commission
  const { data: cfg } = await supabase
    .from("commission_config")
    .select("currency, tiers")
    .eq("id", 1)
    .maybeSingle();
  const currency = cfg?.currency ?? "USD";
  const tiers = (cfg?.tiers ?? []) as unknown as CommissionTier[];
  const { data: compRow } = await supabase
    .from("employee_compensation")
    .select("hourly_rate")
    .eq("employee_id", employee.id)
    .maybeSingle();
  const hourlyRate = compRow?.hourly_rate ?? null;
  const { data: myRow } = await supabase
    .from("monthly_sales")
    .select("amount")
    .eq("employee_id", employee.id)
    .eq("month", month)
    .maybeSingle();
  const mySales = myRow ? Number(myRow.amount) : 0;
  const commission = commissionFor(mySales, tiers);
  const service = createServiceClient();
  const { data: peerSales } = await service
    .from("monthly_sales")
    .select("amount, employees!inner(active)")
    .eq("month", month)
    .eq("employees.active", true);
  const rank =
    (peerSales ?? []).filter((s) => Number(s.amount) > mySales).length + 1;

  const icsUrl = `${appUrl}/s/${employee.magic_token}/calendar.ics`;

  return (
    <div className="flex flex-col gap-6">
      {/* Profile */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center justify-between gap-4">
            <PhotoUpload avatarUrl={employee.avatar_url} name={employee.name} />
            <div className="text-right">
              <p className="font-semibold">{employee.name}</p>
              <p className="text-muted-foreground text-sm">{locName}</p>
            </div>
          </div>
          {hourlyRate != null && (
            <p className="text-muted-foreground text-sm tabular-nums">
              Hourly rate: {formatMoney(hourlyRate, currency)} / h
            </p>
          )}
        </CardContent>
      </Card>

      {/* Schedule + calendar */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Your shifts</CardTitle>
            <CardDescription>Published upcoming shifts.</CardDescription>
          </div>
          <a href={webcalUrl(icsUrl)} className={buttonVariants({ size: "sm" })}>
            Subscribe in calendar
          </a>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {upcoming.length === 0 ? (
            <Alert>
              <AlertTitle>No upcoming shifts</AlertTitle>
              <AlertDescription>
                Your manager hasn&apos;t published shifts for you yet.
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="flex flex-col divide-y">
              {upcoming.map((s) => {
                const name = s.template?.name ?? "Shift";
                const gcal = googleCalendarUrl({
                  title: `${name} · ${locName}`,
                  date: s.date,
                  start: s.start_time,
                  end: s.end_time,
                  tz,
                  location: location?.address ?? locName,
                });
                return (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-2 text-sm"
                  >
                    <span className="flex flex-col">
                      <span className="tabular-nums">
                        {SHORT_WEEKDAYS[isoWeekday(s.date) - 1]} {s.date}
                      </span>
                      <span className="text-muted-foreground">
                        {name} · {hhmm(s.start_time)}–{hhmm(s.end_time)}
                      </span>
                    </span>
                    <a
                      href={gcal}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary shrink-0 text-xs underline"
                    >
                      + Google
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span>Google Calendar (whole schedule): add this URL under “From URL”.</span>
            <CopyButton value={icsUrl} label="Copy feed URL" />
          </div>
        </CardContent>
      </Card>

      {/* Hours */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This week</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-8">
            <Stat label="Hours" value={`${weekStats.totalHours.toFixed(1)}h`} />
            <Stat label="Days" value={String(weekStats.daysWorked)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This month</CardTitle>
            <CardDescription>{month}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-8">
            <Stat label="Hours" value={`${monthStats.totalHours.toFixed(1)}h`} />
            <Stat label="Shifts" value={String(monthStats.shiftCount)} />
          </CardContent>
        </Card>
      </div>

      {/* Commission */}
      {tiers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales &amp; commission</CardTitle>
            <CardDescription>{month}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-8">
              <Stat label="Sales" value={formatMoney(mySales, currency)} />
              <Stat label="Rate" value={`${(commission.rate * 100).toFixed(1)}%`} />
              <Stat
                label="Commission"
                value={formatMoney(commission.earned, currency)}
              />
              <Stat label="Rank" value={`#${rank}`} />
            </div>
            {commission.nextTier ? (
              <p className="text-muted-foreground text-sm">
                {formatMoney(commission.nextTier.remaining, currency)} more in
                sales to reach {(commission.nextTier.rate * 100).toFixed(1)}%.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                You&apos;re at the top tier — great work.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
