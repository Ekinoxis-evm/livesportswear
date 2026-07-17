import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessDate } from "@/lib/business-date";
import { contestStatus, asResults } from "@/lib/rewards";
import { getContestStandings } from "@/server/rewards-data";
import { shortDate } from "@/lib/format-date";
import type { SalesContest } from "@/types/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  GateProgress,
  PrizeList,
  ResultsBoard,
  StandingsBoard,
} from "@/components/rewards/standings";

const RECENT_RESULTS_DAYS = 14;

export default async function StoreRewardsPage() {
  const { locationId } = await requireStore();
  const service = createServiceClient();

  const [{ data: loc }, { data: cfg }, { data: contestRows }] = await Promise.all([
    service.from("locations").select("timezone").eq("id", locationId).maybeSingle(),
    service.from("commission_config").select("currency").eq("id", 1).maybeSingle(),
    service
      .from("sales_contests")
      .select("*")
      .eq("location_id", locationId)
      .order("start_date", { ascending: false }),
  ]);
  const tz = loc?.timezone ?? "UTC";
  const today = businessDate(tz);
  const currency = cfg?.currency ?? "USD";
  const contests = (contestRows ?? []) as SalesContest[];

  const active = contests.filter((c) => contestStatus(c, today) === "active");
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - RECENT_RESULTS_DAYS);
  const recentEnded = contests.filter(
    (c) =>
      contestStatus(c, today) === "ended" &&
      c.end_date >= cutoff.toISOString().slice(0, 10),
  );

  const activeStandings = await Promise.all(
    active.map((c) => getContestStandings(c, tz)),
  );

  return (
    <div className="flex flex-col gap-5">
      {contests.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No contests running — ask your admin to set one up.
          </CardContent>
        </Card>
      )}

      {active.map((c, i) => {
        const standings = activeStandings[i];
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-xl">{c.name}</CardTitle>
              <CardDescription className="tabular-nums">
                {shortDate(c.start_date)} – {shortDate(c.end_date)} · live
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {!standings ? (
                <p className="text-muted-foreground text-sm">
                  Standings unavailable right now.
                </p>
              ) : (
                <>
                  <PrizeList standings={standings} currency={currency} />
                  <GateProgress standings={standings} currency={currency} />
                  <StandingsBoard standings={standings} currency={currency} />
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {recentEnded.map((c) => {
        const results = asResults(c.results);
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-base">{c.name} — results</CardTitle>
              <CardDescription className="tabular-nums">
                Ended {shortDate(c.end_date)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {results ? (
                <ResultsBoard results={results} currency={currency} />
              ) : (
                <p className="text-muted-foreground text-sm">
                  Results are being finalized.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
