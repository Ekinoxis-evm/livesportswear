import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { businessDate } from "@/lib/business-date";
import { primaryTimezone } from "@/lib/business-tz";
import { asTiers, type CommissionTier } from "@/lib/commission";
import { contestStatus, asPersonalGoals, asPrizes, asResults } from "@/lib/rewards";
import { shortDate } from "@/lib/format-date";
import type { SalesContest } from "@/types/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CommissionConfigForm } from "@/components/commission/config-form";
import { StoreMonthForm, type GoalsByLocation } from "@/components/commission/store-month-form";
import { SyncSalesButton } from "@/components/commission/sync-sales-button";
import {
  ContestWizard,
  type ContestFormValues,
} from "@/components/rewards/contest-wizard";
import { DeleteContestDialog } from "@/components/rewards/delete-contest-dialog";

function toFormValues(row: SalesContest): ContestFormValues {
  return {
    id: row.id,
    location_id: row.location_id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    store_threshold: Number(row.store_threshold),
    goal_source: row.goal_source === "monthly" ? ("monthly" as const) : ("custom" as const),
    personal_goals: asPersonalGoals(row.personal_goals),
    prizes: asPrizes(row.prizes),
  };
}

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
  const tzOf = new Map(locations.map((l) => [l.id, l.timezone]));
  const nameOf = new Map(locations.map((l) => [l.id, l.name]));

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

  const { data: contestRows } = await supabase
    .from("sales_contests")
    .select("*")
    .order("start_date", { ascending: false });
  const contests = (contestRows ?? []) as SalesContest[];

  const { data: employeeRows } = await supabase
    .from("employees")
    .select("id, name, location_id")
    .eq("active", true)
    .order("name");
  const wizardEmployees = employeeRows ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Sales &amp; Rewards setup
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Goals, commission tiers, and sales contests. Rankings and standings
          live under{" "}
          <Link
            href="/admin/performance/sales"
            className="underline underline-offset-4"
          >
            Performance
          </Link>
          .
        </p>
        </div>
        <SyncSalesButton />
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
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Sales contests</CardTitle>
              <CardDescription>
                Date-range contests with ranked prizes. Standings live on the{" "}
                <Link
                  href="/admin/performance/rewards"
                  className="underline underline-offset-4"
                >
                  Rewards tab
                </Link>
                .
              </CardDescription>
            </div>
            {locations.length > 0 && (
              <ContestWizard
                locations={locations.map((l) => ({ id: l.id, name: l.name }))}
                employees={wizardEmployees}
                currency={currency}
              >
                <Button size="sm">
                  <Plus className="mr-1 size-4" /> New contest
                </Button>
              </ContestWizard>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {contests.length === 0 && (
            <p className="text-muted-foreground text-sm">No contests yet.</p>
          )}
          {contests.map((c) => {
            const today = businessDate(tzOf.get(c.location_id) ?? "UTC");
            const status = contestStatus(c, today);
            const finalized = asResults(c.results) !== null;
            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {nameOf.get(c.location_id)} · {shortDate(c.start_date)} –{" "}
                    {shortDate(c.end_date)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {status === "active" && <Badge>Live</Badge>}
                  {status === "upcoming" && <Badge variant="secondary">Upcoming</Badge>}
                  {status === "ended" && <Badge variant="outline">Ended</Badge>}
                  {!finalized && (
                    <ContestWizard
                      locations={locations.map((l) => ({ id: l.id, name: l.name }))}
                      employees={wizardEmployees}
                      currency={currency}
                      contest={toFormValues(c)}
                    >
                      <Button variant="ghost" size="icon-sm" aria-label="Edit contest">
                        <Pencil className="size-4" />
                      </Button>
                    </ContestWizard>
                  )}
                  <DeleteContestDialog id={c.id} name={c.name} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
