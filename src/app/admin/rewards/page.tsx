import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { businessDate } from "@/lib/business-date";
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
    personal_source:
      row.personal_source === "monthly" ? ("monthly" as const) : ("custom" as const),
    personal_goals: asPersonalGoals(row.personal_goals),
    prizes: asPrizes(row.prizes),
  };
}

export default async function RewardsPage() {
  const supabase = await createServerClient();

  const { data: config } = await supabase
    .from("commission_config")
    .select("currency")
    .eq("id", 1)
    .maybeSingle();
  const currency = config?.currency ?? "USD";

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, timezone")
    .eq("active", true)
    .order("name");
  const locations = locationRows ?? [];
  const tzOf = new Map(locations.map((l) => [l.id, l.timezone]));
  const nameOf = new Map(locations.map((l) => [l.id, l.name]));

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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Sales contests and their prizes. Live standings and results are on the{" "}
          <Link
            href="/admin/performance/rewards"
            className="underline underline-offset-4"
          >
            Performance → Rewards
          </Link>{" "}
          tab; commission tiers and goals are under{" "}
          <Link href="/admin/commission" className="underline underline-offset-4">
            Commission
          </Link>
          .
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Sales contests</CardTitle>
              <CardDescription>
                Date-range contests with ranked prizes.
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
