import { Trophy, Medal, Award, Lock, Check } from "lucide-react";
import { formatMoney } from "@/lib/commission";
import type { ContestResults, ContestStandings } from "@/lib/rewards";
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
  threshold,
  currency,
}: {
  standings: ContestStandings;
  threshold: number;
  currency: string;
}) {
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
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatMoney(standings.storeTotal, currency)}
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
  const prizeByPlace = new Map(standings.places.map((p) => [p.place, p]));
  return (
    <ul className="flex flex-col divide-y">
      {standings.ranking.map((r) => {
        const place = prizeByPlace.get(r.place);
        const me = r.employeeId === highlightEmployeeId;
        return (
          <li
            key={r.employeeId}
            className={cn(
              "flex items-center justify-between gap-3 py-2 text-sm",
              me && "font-semibold",
            )}
          >
            <span className="flex items-center gap-2">
              {place ? (
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
              {place && (
                <span
                  className={cn(
                    "text-xs",
                    place.winning ? "text-primary" : "text-muted-foreground line-through",
                  )}
                >
                  {place.prize}
                  {place.holder && !place.thresholdMet && place.min_sales !== null && (
                    <span className="text-muted-foreground ml-1 no-underline">
                      (needs {formatMoney(place.min_sales, currency)})
                    </span>
                  )}
                </span>
              )}
              <span className="font-medium tabular-nums">
                {formatMoney(r.amount, currency)}
              </span>
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
  return (
    <div className="flex flex-col gap-2">
      {!results.gate_passed && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Lock className="size-4" /> The store goal wasn&apos;t reached — no prizes
          this time ({formatMoney(results.store_total, currency)} total).
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
                {r.won && <span className="text-primary text-xs">{r.prize}</span>}
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
