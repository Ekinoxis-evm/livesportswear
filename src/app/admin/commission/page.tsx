import { createServerClient } from "@/lib/supabase/server";
import { businessDate } from "@/lib/business-date";
import { primaryTimezone } from "@/lib/business-tz";
import {
  commissionFor,
  formatMoney,
  asTiers,
  resolveTiers,
  type CommissionTier,
} from "@/lib/commission";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CommissionConfigForm } from "@/components/commission/config-form";
import { monthLabel } from "@/lib/format-date";
import type { GoalsByLocation } from "@/components/settings/store-goals-form";
import { StoreMonthForm } from "@/components/commission/store-month-form";

export default async function CommissionPage() {
  const supabase = await createServerClient();
  const today = businessDate(await primaryTimezone());
  const month = today.slice(0, 7);
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
    .select("id, name")
    .eq("active", true)
    .order("name");
  const locations = locationRows ?? [];

  const { data: goalRows } = await supabase
    .from("store_goals")
    .select("location_id, month, goal_amount, tiers")
    .eq("year", year);
  const goalsByLocation: GoalsByLocation = {};
  const tiersByKey: Record<string, CommissionTier[]> = {};
  const monthTiersByLoc: Record<string, CommissionTier[]> = {};
  for (const g of goalRows ?? []) {
    (goalsByLocation[g.location_id] ??= {})[g.month] = Number(g.goal_amount);
    const t = asTiers(g.tiers);
    if (t.length) tiersByKey[`${g.location_id}-${g.month}`] = t;
    if (g.month === monthNum) monthTiersByLoc[g.location_id] = resolveTiers(g.tiers, globalTiers);
  }

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, location_id, locations(name)")
    .eq("active", true)
    .order("name");
  const { data: sales } = await supabase
    .from("monthly_sales")
    .select("employee_id, amount")
    .eq("month", month);
  const salesBy = new Map((sales ?? []).map((s) => [s.employee_id, Number(s.amount)]));

  const ranking = (employees ?? [])
    .map((e) => {
      const amount = salesBy.get(e.id) ?? 0;
      const tiers = monthTiersByLoc[e.location_id] ?? globalTiers;
      return {
        id: e.id,
        name: e.name,
        store: (e.locations as { name: string } | null)?.name ?? "—",
        amount,
        ...commissionFor(amount, tiers),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales &amp; commission</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Monthly goals and commission tiers per store, and this month&apos;s sales
          ({monthLabel(month)}).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Store setup — goal &amp; commission</CardTitle>
          <CardDescription>
            Pick a store and month, then set that month&apos;s sales goal and its
            commission tiers together. Tiers fall back to the global default below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StoreMonthForm
            locations={locations}
            year={year}
            month={monthNum}
            goalsByLocation={goalsByLocation}
            tiersByKey={tiersByKey}
            globalTiers={globalTiers}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking</CardTitle>
          <CardDescription>
            By sales this month — rate uses each rep&apos;s store tiers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ranking.length === 0 ? (
            <p className="text-muted-foreground text-sm">No active employees.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden sm:table-cell">Store</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead className="hidden md:table-cell">To next tier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {r.store}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(r.amount, currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{(r.rate * 100).toFixed(1)}%</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(r.earned, currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden tabular-nums md:table-cell">
                      {r.nextTier
                        ? `${formatMoney(r.nextTier.remaining, currency)} → ${(r.nextTier.rate * 100).toFixed(1)}%`
                        : "Top tier"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
