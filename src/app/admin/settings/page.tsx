import { createServerClient } from "@/lib/supabase/server";
import { getPayPeriod } from "@/lib/payroll-config";
import { sprintRange, payday } from "@/lib/scheduling/payroll";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { CurrencyForm } from "@/components/settings/currency-form";
import { RatesTable } from "@/components/settings/rates-table";
import { PayPeriodForm } from "@/components/settings/pay-period-form";
import { ShopifyPanel } from "@/components/settings/shopify-panel";

export default async function SettingsPage() {
  const supabase = await createServerClient();

  const { data: config } = await supabase
    .from("commission_config")
    .select("currency")
    .eq("id", 1)
    .maybeSingle();
  const currency = config?.currency ?? "USD";

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, shopify_staff_id")
    .eq("active", true)
    .order("name");
  const { data: comp } = await supabase
    .from("employee_compensation")
    .select("employee_id, hourly_rate");
  const rateBy = new Map(
    (comp ?? []).map((c) => [c.employee_id, c.hourly_rate]),
  );
  const rates = (employees ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    rate: rateBy.get(e.id) ?? null,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const { anchor, cap } = await getPayPeriod();
  const sprint = sprintRange(anchor, today);
  const nextPayday = payday(anchor, today);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Business currency, hourly rates, and pay-period configuration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Currency</CardTitle>
          <CardDescription>
            Used across commission, sales, and pay displays.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CurrencyForm currency={currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hourly rates</CardTitle>
          <CardDescription>
            Private — used for labor-cost estimates. Never shown to employees.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rates.length === 0 ? (
            <p className="text-muted-foreground text-sm">No active employees.</p>
          ) : (
            <RatesTable employees={rates} currency={currency} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pay period</CardTitle>
          <CardDescription>
            Sprints are two weeks; payday is the Friday after a sprint ends. The
            anchor must be a Monday.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <PayPeriodForm anchor={anchor} cap={cap} />
          <div className="text-muted-foreground flex flex-col gap-1 border-t pt-3 text-sm tabular-nums">
            <span>
              Current sprint: {sprint.start} – {sprint.end}
            </span>
            <span>Next payday: {nextPayday}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shopify</CardTitle>
          <CardDescription>
            Sync monthly sales by POS staff member (feeds commission &amp;
            ranking).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ShopifyPanel
            configured={isShopifyConfigured()}
            employees={employees ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
}
