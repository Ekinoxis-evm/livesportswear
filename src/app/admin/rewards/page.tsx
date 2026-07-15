import { Plus, Pencil } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { accessibleLocationIds } from "@/lib/auth";
import { businessDate } from "@/lib/business-date";
import { contestStatus, asPrizes, asResults } from "@/lib/rewards";
import {
  finalizeEndedContests,
  getContestStandings,
  toContest,
} from "@/server/rewards-data";
import { shortDate } from "@/lib/format-date";
import type { SalesContest } from "@/types/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GateProgress,
  ResultsBoard,
  StandingsBoard,
} from "@/components/rewards/standings";
import {
  ContestFormSheet,
  type ContestFormValues,
} from "@/components/rewards/contest-form";
import { DeleteContestDialog } from "@/components/rewards/delete-contest-dialog";

function toFormValues(row: SalesContest): ContestFormValues {
  return {
    id: row.id,
    location_id: row.location_id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    store_threshold: Number(row.store_threshold),
    prizes: asPrizes(row.prizes),
  };
}

export default async function RewardsAdminPage() {
  const supabase = await createServerClient();

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, timezone")
    .eq("active", true)
    .order("name");
  const access = await accessibleLocationIds();
  const locations = (locationRows ?? []).filter(
    (l) => access === "all" || access.includes(l.id),
  );
  const tzOf = new Map(locations.map((l) => [l.id, l.timezone]));
  const nameOf = new Map(locations.map((l) => [l.id, l.name]));

  const { data: currencyRow } = await supabase
    .from("commission_config")
    .select("currency")
    .eq("id", 1)
    .maybeSingle();
  const currency = currencyRow?.currency ?? "USD";

  // Fallback finalize on view: the daily cron is the primary writer, but an
  // admin looking at results right after a contest ends shouldn't wait for it.
  await finalizeEndedContests();

  const { data: contestRows } = await supabase
    .from("sales_contests")
    .select("*")
    .in("location_id", locations.map((l) => l.id))
    .order("start_date", { ascending: false });
  const contests = (contestRows ?? []) as SalesContest[];

  const grouped = { active: [] as SalesContest[], upcoming: [] as SalesContest[], ended: [] as SalesContest[] };
  for (const c of contests) {
    const today = businessDate(tzOf.get(c.location_id) ?? "UTC");
    grouped[contestStatus(c, today)].push(c);
  }

  const activeStandings = await Promise.all(
    grouped.active.map((c) => getContestStandings(c, tzOf.get(c.location_id) ?? "UTC")),
  );

  const sections: {
    key: "active" | "upcoming" | "ended";
    title: string;
    rows: SalesContest[];
  }[] = [
    { key: "active", title: "Active", rows: grouped.active },
    { key: "upcoming", title: "Upcoming", rows: grouped.upcoming },
    { key: "ended", title: "Ended", rows: grouped.ended },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Sales contests per store. The store goal is a gate — final results
            snapshot on the morning after the end date.
          </p>
        </div>
        {locations.length > 0 && (
          <ContestFormSheet
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
            currency={currency}
          >
            <Button size="sm">
              <Plus className="mr-1 size-4" /> New contest
            </Button>
          </ContestFormSheet>
        )}
      </div>

      {contests.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No contests yet — create the first one.
        </p>
      )}

      {sections.map(
        ({ key, title, rows }) =>
          rows.length > 0 && (
            <div key={key} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                {title}
              </h2>
              {rows.map((c) => {
                const contest = toContest(c);
                const results = asResults(c.results);
                const standings =
                  key === "active"
                    ? activeStandings[grouped.active.indexOf(c)]
                    : null;
                return (
                  <Card key={c.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">{c.name}</CardTitle>
                          <CardDescription className="tabular-nums">
                            {nameOf.get(c.location_id)} · {shortDate(c.start_date)} –{" "}
                            {shortDate(c.end_date)}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-1">
                          {key === "active" && <Badge>Live</Badge>}
                          {!results && (
                            <ContestFormSheet
                              locations={locations.map((l) => ({ id: l.id, name: l.name }))}
                              currency={currency}
                              contest={toFormValues(c)}
                            >
                              <Button variant="ghost" size="icon-sm" aria-label="Edit contest">
                                <Pencil className="size-4" />
                              </Button>
                            </ContestFormSheet>
                          )}
                          <DeleteContestDialog id={c.id} name={c.name} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      {key === "ended" && results ? (
                        <ResultsBoard results={results} currency={currency} />
                      ) : key === "active" ? (
                        standings ? (
                          <>
                            <GateProgress
                              standings={standings}
                              threshold={contest.store_threshold}
                              currency={currency}
                            />
                            <StandingsBoard standings={standings} currency={currency} />
                          </>
                        ) : (
                          <p className="text-muted-foreground text-sm">
                            Standings unavailable — Shopify isn&apos;t reachable.
                          </p>
                        )
                      ) : (
                        <p className="text-muted-foreground text-sm">
                          {key === "upcoming"
                            ? `Starts ${shortDate(c.start_date)}.`
                            : "Results pending — snapshot runs after the end date."}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ),
      )}
    </div>
  );
}
