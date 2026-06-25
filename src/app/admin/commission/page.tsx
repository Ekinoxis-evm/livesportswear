import { createServerClient } from "@/lib/supabase/server";
import {
  commissionFor,
  formatMoney,
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CommissionConfigForm } from "@/components/commission/config-form";
import { SalesEntry } from "@/components/commission/sales-entry";

export default async function CommissionPage() {
  const supabase = await createServerClient();
  const month = new Date().toISOString().slice(0, 7);

  const { data: config } = await supabase
    .from("commission_config")
    .select("currency, tiers")
    .eq("id", 1)
    .maybeSingle();
  const currency = config?.currency ?? "USD";
  // tiers is jsonb (untyped at the DB layer).
  const tiers = (config?.tiers ?? []) as unknown as CommissionTier[];

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name")
    .eq("active", true)
    .order("name");
  const { data: sales } = await supabase
    .from("monthly_sales")
    .select("employee_id, amount")
    .eq("month", month);
  const salesBy = new Map(
    (sales ?? []).map((s) => [s.employee_id, Number(s.amount)]),
  );

  const emps = (employees ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    amount: salesBy.get(e.id) ?? 0,
  }));
  const ranking = emps
    .map((e) => ({ ...e, ...commissionFor(e.amount, tiers) }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Commission</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Global tiers and this month&apos;s sales ({month}).
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tiers</CardTitle>
            <CardDescription>
              The rate each rep earns once their monthly sales reach a tier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CommissionConfigForm tiers={tiers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales this month</CardTitle>
            <CardDescription>
              Manual entry for now; Shopify will populate this later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emps.length === 0 ? (
              <p className="text-muted-foreground text-sm">No active employees.</p>
            ) : (
              <SalesEntry month={month} employees={emps} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking</CardTitle>
          <CardDescription>By sales this month.</CardDescription>
        </CardHeader>
        <CardContent>
          {tiers.length === 0 ? (
            <Alert>
              <AlertTitle>No tiers configured</AlertTitle>
              <AlertDescription>Add tiers above to compute rates.</AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Employee</TableHead>
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
                    <TableCell className="tabular-nums">
                      {formatMoney(r.amount, currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {(r.rate * 100).toFixed(1)}%
                      </Badge>
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
