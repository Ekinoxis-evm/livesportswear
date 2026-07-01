import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { weekStart, weekDays, addDays } from "@/lib/scheduling/week";
import { businessDate } from "@/lib/business-date";
import { employeeStats, type StatShift } from "@/lib/scheduling/stats";
import {
  commissionFor,
  formatMoney,
  asTiers,
  resolveTiers,
} from "@/lib/commission";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PhotoUpload } from "@/components/portal/photo-upload";

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

  const { data: location } = await supabase
    .from("locations")
    .select("name, timezone")
    .eq("id", employee.location_id)
    .maybeSingle();
  const locName = location?.name ?? "Live Active Wear";
  // "Today" in the store's timezone, not the server's UTC.
  const today = businessDate(location?.timezone ?? "UTC");
  const thisWeek = new Set(weekDays(weekStart(today)));
  const month = today.slice(0, 7);

  // Hours (published shifts around now).
  const { data: shiftData } = await supabase
    .from("shifts")
    .select(
      "id, employee_id, date, start_time, end_time, shift_template_id, schedules!inner(status)",
    )
    .eq("employee_id", employee.id)
    .eq("schedules.status", "published")
    .gte("date", addDays(today, -35))
    .lte("date", addDays(today, 40));
  const shifts = (shiftData ?? []) as StatShift[];
  const weekStats = employeeStats(
    shifts.filter((s) => thisWeek.has(s.date)),
    employee.id,
  );
  const monthStats = employeeStats(
    shifts.filter((s) => s.date.slice(0, 7) === month),
    employee.id,
  );

  // Sales & commission (uses the employee's store/month tiers).
  const { data: cfg } = await supabase
    .from("commission_config")
    .select("currency, tiers")
    .eq("id", 1)
    .maybeSingle();
  const currency = cfg?.currency ?? "USD";
  const { data: storeGoal } = await supabase
    .from("store_goals")
    .select("tiers")
    .eq("location_id", employee.location_id)
    .eq("year", Number(month.slice(0, 4)))
    .eq("month", Number(month.slice(5, 7)))
    .maybeSingle();
  const tiers = resolveTiers(storeGoal?.tiers, asTiers(cfg?.tiers));
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

  return (
    <div className="flex flex-col gap-6">
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
              <Stat label="Commission" value={formatMoney(commission.earned, currency)} />
              <Stat label="Rank" value={`#${rank}`} />
            </div>
            {commission.nextTier ? (
              <p className="text-muted-foreground text-sm">
                {formatMoney(commission.nextTier.remaining, currency)} more in sales to
                reach {(commission.nextTier.rate * 100).toFixed(1)}%.
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
