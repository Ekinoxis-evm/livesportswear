import { requireEmployee } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { businessDate } from "@/lib/business-date";
import { contestStatus, asResults } from "@/lib/rewards";
import { getContestStandings } from "@/server/rewards-data";
import { formatMoney } from "@/lib/commission";
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
  MyPersonalProgress,
  PrizeList,
  ResultsBoard,
  StandingsBoard,
} from "@/components/rewards/standings";

export default async function PortalRewardsPage() {
  const { employee } = await requireEmployee();
  const supabase = await createServerClient();

  const [{ data: loc }, { data: cfg }, { data: contestRows }] = await Promise.all([
    supabase
      .from("locations")
      .select("timezone")
      .eq("id", employee.location_id)
      .maybeSingle(),
    supabase.from("commission_config").select("currency").eq("id", 1).maybeSingle(),
    // RLS limits this to the employee's own location.
    supabase
      .from("sales_contests")
      .select("*")
      .eq("location_id", employee.location_id)
      .order("start_date", { ascending: false }),
  ]);
  const tz = loc?.timezone ?? "UTC";
  const today = businessDate(tz);
  const currency = cfg?.currency ?? "USD";
  const contests = (contestRows ?? []) as SalesContest[];

  const active = contests.filter((c) => contestStatus(c, today) === "active");
  const upcoming = contests.filter((c) => contestStatus(c, today) === "upcoming");
  const past = contests.filter((c) => contestStatus(c, today) === "ended");

  const activeStandings = await Promise.all(
    active.map((c) => getContestStandings(c, tz)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Rewards</h1>
        <p className="text-muted-foreground text-sm">
          Sales contests at your store — where you stand and what&apos;s at stake.
        </p>
      </div>

      {contests.length === 0 && (
        <p className="text-muted-foreground text-sm">No contests yet.</p>
      )}

      {active.map((c, i) => {
        const standings = activeStandings[i];
        const me = standings?.ranking.find((r) => r.employeeId === employee.id);
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-base">{c.name}</CardTitle>
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
                  {me && (
                    <div className="flex flex-wrap gap-8">
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-xs">My net sales</span>
                        <span className="text-xl font-semibold tabular-nums">
                          {formatMoney(me.amount, currency)}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-muted-foreground text-xs">My place</span>
                        <span className="text-xl font-semibold tabular-nums">
                          #{me.place}
                        </span>
                      </div>
                      {me.toNextPlace !== null && (
                        <div className="flex flex-col">
                          <span className="text-muted-foreground text-xs">
                            To move up
                          </span>
                          <span className="text-xl font-semibold tabular-nums">
                            {formatMoney(me.toNextPlace, currency)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <GateProgress
                    standings={standings}
                    currency={currency}
                  />
                  <MyPersonalProgress
                    standings={standings}
                    employeeId={employee.id}
                    currency={currency}
                  />
                  <PrizeList standings={standings} currency={currency} />
                  <StandingsBoard
                    standings={standings}
                    currency={currency}
                    highlightEmployeeId={employee.id}
                  />
                </>
              )}
            </CardContent>
          </Card>
        );
      })}

      {upcoming.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <CardTitle className="text-base">{c.name}</CardTitle>
            <CardDescription className="tabular-nums">
              Starts {shortDate(c.start_date)}
            </CardDescription>
          </CardHeader>
        </Card>
      ))}

      {past.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Past</h2>
          {past.map((c) => {
            const results = asResults(c.results);
            const mine = results?.standings.find(
              (r) => r.employee_id === employee.id,
            );
            return (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <CardDescription className="tabular-nums">
                    {shortDate(c.start_date)} – {shortDate(c.end_date)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {mine?.won && (
                    <p className="text-primary text-sm font-semibold">
                      You won: {mine.prizes.join(" + ")} 🎉
                    </p>
                  )}
                  {results ? (
                    <ResultsBoard
                      results={results}
                      currency={currency}
                      highlightEmployeeId={employee.id}
                    />
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
      )}
    </div>
  );
}
