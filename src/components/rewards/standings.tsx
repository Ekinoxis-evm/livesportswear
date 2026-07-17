import { Trophy, Medal, Award, Lock, Check, Gift } from "lucide-react";
import { formatMoney } from "@/lib/commission";
import {
  conditionsLabel,
  ordinal,
  placeLabelList,
  prizesForEmployee,
  type ContestResults,
  type ContestStandings,
  type PrizeBlocker,
} from "@/lib/rewards";
import { cn } from "@/lib/utils";

const PLACE_ICONS = [Trophy, Medal, Award];

function PlaceIcon({ place, className }: { place: number; className?: string }) {
  const Icon = PLACE_ICONS[place - 1] ?? Award;
  const color =
    place === 1 ? "text-amber-500" : place === 2 ? "text-slate-400" : "text-amber-700";
  return <Icon className={cn("size-4", color, className)} />;
}

export function GateProgress({
  standings,
  currency,
}: {
  standings: ContestStandings;
  currency: string;
}) {
  const { source, total, threshold } = standings.gate;
  if (threshold <= 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">
          {standings.gatePassed ? (
            <Check className="text-primary size-4" />
          ) : (
            <Lock className="text-muted-foreground size-4" />
          )}
          Store goal {formatMoney(threshold, currency)}
          {source === "monthly" && (
            <span className="text-muted-foreground text-xs">(monthly goal)</span>
          )}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatMoney(total, currency)}
          {!standings.gatePassed &&
            ` · ${formatMoney(standings.gateRemaining, currency)} to unlock prizes`}
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${Math.round(standings.gateProgress * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function StandingsBoard({
  standings,
  currency,
  highlightEmployeeId,
}: {
  standings: ContestStandings;
  currency: string;
  highlightEmployeeId?: string;
}) {
  const blockerText = (b: PrizeBlocker, conditions: { position: number | null; min_sales: number | null }): string => {
    switch (b) {
      case "position":
        return conditions.position !== null
          ? `needs ${ordinal(conditions.position)} place`
          : "needs position";
      case "min_sales":
        return conditions.min_sales !== null
          ? `needs ${formatMoney(conditions.min_sales, currency)}`
          : "needs minimum";
      case "store_goal":
        return "needs store goal";
      case "personal_goal":
        return "needs their personal goal";
    }
  };

  return (
    <ul className="flex flex-col divide-y">
      {standings.ranking.map((r) => {
        const me = r.employeeId === highlightEmployeeId;
        const myPrizes = prizesForEmployee(standings, r.employeeId);
        // Show what this rep is winning, plus what they're one step away from
        // (position blockers hidden for non-holders — that's just "not you").
        const relevant = myPrizes.filter(
          (p) => p.unlocked || !p.blockers.includes("position"),
        );
        return (
          <li
            key={r.employeeId}
            className={cn(
              "flex items-start justify-between gap-3 py-2 text-sm",
              me && "font-semibold",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2">
                {r.place <= 3 ? (
                  <PlaceIcon place={r.place} />
                ) : (
                  <span className="text-muted-foreground w-4 text-center tabular-nums">
                    {r.place}
                  </span>
                )}
                {r.name}
                {me && <span className="text-primary text-xs">(you)</span>}
              </span>
              {relevant.length > 0 && (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-6">
                  {relevant.map((p, i) => (
                    <span
                      key={i}
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        p.unlocked ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {p.unlocked ? (
                        <Check className="size-3" />
                      ) : (
                        <Lock className="size-3" />
                      )}
                      {placeLabelList(p.items, currency)}
                      {!p.unlocked && (
                        <span className="text-muted-foreground">
                          ({p.blockers.map((b) => blockerText(b, p.conditions)).join(", ")})
                        </span>
                      )}
                    </span>
                  ))}
                </span>
              )}
              {r.personalGoal !== null && !r.personalMet && (
                <span className="flex items-center gap-2 pl-6">
                  <span className="bg-muted h-1.5 w-24 overflow-hidden rounded-full">
                    <span
                      className="bg-primary block h-full rounded-full"
                      style={{
                        width: `${Math.round(Math.min(1, r.personalProgress / r.personalGoal) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {formatMoney(Math.max(0, r.personalGoal - r.personalProgress), currency)}{" "}
                    to their goal
                  </span>
                </span>
              )}
            </div>
            <span className="font-medium tabular-nums">
              {formatMoney(r.amount, currency)}
            </span>
          </li>
        );
      })}
      {standings.ranking.length === 0 && (
        <li className="text-muted-foreground py-2 text-sm">
          No mapped employees at this store yet.
        </li>
      )}
    </ul>
  );
}

export function ResultsBoard({
  results,
  currency,
  highlightEmployeeId,
}: {
  results: ContestResults;
  currency: string;
  highlightEmployeeId?: string;
}) {
  const anyWon = results.standings.some((s) => s.won);
  return (
    <div className="flex flex-col gap-2">
      {!results.gate_passed && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Lock className="size-4" />
          {anyWon
            ? `The store goal wasn't reached (${formatMoney(results.store_total, currency)} total) — prizes that needed it stayed locked.`
            : `The store goal wasn't reached — no prizes this time (${formatMoney(results.store_total, currency)} total).`}
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {results.standings.map((r) => {
          const me = r.employee_id === highlightEmployeeId;
          return (
            <li
              key={r.employee_id}
              className={cn(
                "flex items-center justify-between gap-3 py-2 text-sm",
                me && "font-semibold",
              )}
            >
              <span className="flex items-center gap-2">
                {r.won ? (
                  <PlaceIcon place={r.place} />
                ) : (
                  <span className="text-muted-foreground w-4 text-center tabular-nums">
                    {r.place}
                  </span>
                )}
                {r.name}
                {me && <span className="text-primary text-xs">(you)</span>}
              </span>
              <span className="flex items-center gap-3">
                {r.won && (
                  <span className="text-primary text-xs">{r.prizes.join(" + ")}</span>
                )}
                <span className="font-medium tabular-nums">
                  {formatMoney(r.amount, currency)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The employee's personal-goal bar (third bar on the portal). */
export function MyPersonalProgress({
  standings,
  employeeId,
  currency,
}: {
  standings: ContestStandings;
  employeeId: string;
  currency: string;
}) {
  const me = standings.ranking.find((r) => r.employeeId === employeeId);
  if (!me || me.personalGoal === null) return null;

  const met = me.personalMet;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">
          {met ? (
            <Check className="text-primary size-4" />
          ) : (
            <Lock className="text-muted-foreground size-4" />
          )}
          Your personal goal {formatMoney(me.personalGoal, currency)}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {met ? "done" : `${formatMoney(me.personalGoal - me.personalProgress, currency)} to go`}
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{
            width: `${Math.round(Math.min(1, me.personalProgress / me.personalGoal) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

/** The contest's prizes with their conditions — "what's at stake" up top. */
export function PrizeList({
  standings,
  currency,
}: {
  standings: ContestStandings;
  currency: string;
}) {
  if (standings.prizes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {standings.prizes.map((p, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Gift className="text-primary mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">
            <span className="font-medium">{placeLabelList(p.items, currency)}</span>
            <span className="text-muted-foreground">
              {" — "}
              {conditionsLabel(p.conditions, currency) === "everyone"
                ? "everyone wins this"
                : conditionsLabel(p.conditions, currency)}
            </span>
            {p.winners.length > 0 && (
              <span className="text-primary text-xs">
                {" · "}
                {p.winners.map((w) => w.name).join(", ")}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
