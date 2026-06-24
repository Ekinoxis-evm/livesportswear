import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  commissionFor,
  formatMoney,
  type CommissionTier,
} from "@/lib/commission";
import { weekStart, weekDays, addDays, isoWeekday } from "@/lib/scheduling/week";
import { SHORT_WEEKDAYS } from "@/lib/weekdays";
import { employeeStats, type StatShift } from "@/lib/scheduling/stats";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PhotoUpload } from "@/components/portal/photo-upload";

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

  // Own published shifts only (RLS gives own shifts; inner-join published schedules).
  const { data: shiftData } = await supabase
    .from("shifts")
    .select(
      "employee_id, date, start_time, end_time, shift_template_id, template:shift_templates(name), schedules!inner(status)",
    )
    .eq("employee_id", employee.id)
    .eq("schedules.status", "published")
    .gte("date", addDays(today, -35))
    .lte("date", addDays(today, 40))
    .order("date");
  const shifts = (shiftData ?? []) as (StatShift & {
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

  // Commission: own sales (RLS self-read) + global config; rank via service
  // client so peers' sales are never exposed — only the rep's position.
  const { data: cfg } = await supabase
    .from("commission_config")
    .select("currency, tiers")
    .eq("id", 1)
    .maybeSingle();
  const currency = cfg?.currency ?? "COP";
  const tiers = (cfg?.tiers ?? []) as unknown as CommissionTier[];
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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Hi, {employee.name}</CardTitle>
          <CardDescription>Your schedule and hours at a glance.</CardDescription>
        </CardHeader>
        <CardContent>
          <PhotoUpload avatarUrl={employee.avatar_url} name={employee.name} />
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upcoming shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <Alert>
              <AlertTitle>No upcoming shifts</AlertTitle>
              <AlertDescription>
                Your manager hasn&apos;t published shifts for you yet.
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="flex flex-col divide-y">
              {upcoming.map((s, i) => (
                <li
                  key={`${s.date}-${i}`}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="tabular-nums">
                    {SHORT_WEEKDAYS[isoWeekday(s.date) - 1]} {s.date}
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
    </div>
  );
}
