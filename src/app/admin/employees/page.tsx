import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { businessDate } from "@/lib/business-date";
import { primaryTimezone } from "@/lib/business-tz";
import { getPayPeriod } from "@/lib/payroll-config";
import { sprintRange, payday } from "@/lib/scheduling/payroll";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmployeesTable } from "@/components/admin/employees-table";
import { PayPeriodForm } from "@/components/settings/pay-period-form";
import { shortDate, shortDateRange } from "@/lib/format-date";

export default async function EmployeesPage() {
  const supabase = await createServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, active")
    .order("name");
  const activeLocations = (locationRows ?? [])
    .filter((l) => l.active)
    .map((l) => ({ id: l.id, name: l.name }));

  const { data: employees, error } = await supabase
    .from("employees")
    .select("*")
    .order("name");

  // Pay + rates (moved here from Settings). Sprint dates in the store's timezone.
  const today = businessDate(await primaryTimezone());
  const { anchor, cap } = await getPayPeriod();
  const sprint = sprintRange(anchor, today);
  const nextPayday = payday(anchor, today);

  const { data: cfg } = await supabase
    .from("commission_config")
    .select("currency")
    .eq("id", 1)
    .maybeSingle();
  const currency = cfg?.currency ?? "USD";
  const { data: comp } = await supabase
    .from("employee_compensation")
    .select("employee_id, hourly_rate");
  const rateBy = new Map((comp ?? []).map((c) => [c.employee_id, c.hourly_rate]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Staff and the rules that govern their schedules.
          </p>
        </div>
        <Link href="/admin/employees/new" className={buttonVariants()}>
          New employee
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pay period</CardTitle>
          <CardDescription>
            Sprints are two weeks; payday is the Friday after a sprint ends. The
            anchor must be a Monday.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border-primary/30 bg-primary/5 flex flex-col gap-1 rounded-lg border p-4">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">
                Current sprint
              </span>
              <span className="text-lg font-semibold">
                {shortDateRange(sprint.start, sprint.end)}
              </span>
            </div>
            <div className="border-primary/30 bg-primary/5 flex flex-col gap-1 rounded-lg border p-4">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">
                Next payday
              </span>
              <span className="text-lg font-semibold">{shortDate(nextPayday)}</span>
            </div>
          </div>
          <PayPeriodForm anchor={anchor} cap={cap} />
        </CardContent>
      </Card>

      {activeLocations.length === 0 ? (
        <Alert>
          <AlertTitle>Add a location first</AlertTitle>
          <AlertDescription>
            Every employee belongs to a store. Create an active location before
            adding staff.
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load employees</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : !employees || employees.length === 0 ? (
        <Alert>
          <AlertTitle>No employees yet</AlertTitle>
          <AlertDescription>Add your first team member.</AlertDescription>
        </Alert>
      ) : (
        <EmployeesTable
          currency={currency}
          appUrl={appUrl}
          rows={employees.map((emp) => ({
            id: emp.id,
            name: emp.name,
            email: emp.email,
            avatarColor: emp.avatar_color,
            active: emp.active,
            magicToken: emp.magic_token,
            rate: rateBy.get(emp.id) != null ? Number(rateBy.get(emp.id)) : null,
          }))}
        />
      )}
    </div>
  );
}
