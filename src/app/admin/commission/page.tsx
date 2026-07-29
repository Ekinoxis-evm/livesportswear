import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { businessDate } from "@/lib/business-date";
import { primaryTimezone } from "@/lib/business-tz";
import { asTiers, type CommissionTier } from "@/lib/commission";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CommissionConfigForm } from "@/components/commission/config-form";
import {
  MonthlySetup,
  type GoalsByLocation,
  type EmployeeGoalsByKey,
} from "@/components/commission/monthly-setup";
import { SyncSalesButton } from "@/components/shared/sync-sales-button";
import { syncMonthlySales } from "@/server/shopify";

export default async function CommissionPage() {
  const supabase = await createServerClient();
  const today = businessDate(await primaryTimezone());
  const year = Number(today.slice(0, 4));
  const monthNum = Number(today.slice(5, 7));

  const { data: config } = await supabase
    .from("commission_config")
    .select("currency, tiers")
    .eq("id", 1)
    .maybeSingle();
  const currency = config?.currency ?? "USD";
  const globalTiers = asTiers(config?.tiers);

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, timezone")
    .eq("active", true)
    .order("name");
  const locations = locationRows ?? [];

  const { data: goalRows } = await supabase
    .from("store_goals")
    .select("location_id, year, month, goal_amount, tiers")
    .in("year", [year, year + 1]);
  const goalsByLocation: GoalsByLocation = {};
  const tiersByKey: Record<string, CommissionTier[]> = {};
  for (const g of goalRows ?? []) {
    (goalsByLocation[g.location_id] ??= {})[`${g.year}-${g.month}`] = Number(g.goal_amount);
    const t = asTiers(g.tiers);
    if (t.length) tiersByKey[`${g.location_id}-${g.year}-${g.month}`] = t;
  }

  const { data: employeeRows } = await supabase
    .from("employees")
    .select("id, name")
    .eq("active", true)
    .order("name");
  const employees = employeeRows ?? [];

  const { data: empGoalRows } = await supabase
    .from("employee_goals")
    .select("employee_id, year, month, goal_amount")
    .in("year", [year, year + 1]);
  const goalsByEmployee: EmployeeGoalsByKey = {};
  for (const g of empGoalRows ?? []) {
    (goalsByEmployee[g.employee_id] ??= {})[`${g.year}-${g.month}`] = Number(
      g.goal_amount,
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Commission &amp; goals
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sales goals and commission tiers. Sales contests live under{" "}
            <Link href="/admin/rewards" className="underline underline-offset-4">
              Rewards
            </Link>
            ; rankings under{" "}
            <Link
              href="/admin/performance/sales"
              className="underline underline-offset-4"
            >
              Performance
            </Link>
            .
          </p>
        </div>
        <SyncSalesButton action={syncMonthlySales} label="Sync sales now" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">This month — goals &amp; commission</CardTitle>
          <CardDescription>
            Set the month&apos;s commission tiers, each rep&apos;s personal goal and the store
            goal together. The personal goal is the first tier that unlocks more commission; the
            store goal is the sum of the personal goals — the Apply buttons line them up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlySetup
            locations={locations}
            employees={employees.map((e) => ({ id: e.id, name: e.name }))}
            year={year}
            month={monthNum}
            goalsByLocation={goalsByLocation}
            tiersByKey={tiersByKey}
            globalTiers={globalTiers}
            goalsByEmployee={goalsByEmployee}
            currency={currency}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global default tiers</CardTitle>
          <CardDescription>
            Used for any store/month without its own tiers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CommissionConfigForm tiers={globalTiers} currency={currency} />
        </CardContent>
      </Card>
    </div>
  );
}
