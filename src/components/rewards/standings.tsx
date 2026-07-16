import { Trophy, Medal, Award, Lock, Check } from "lucide-react";
import { formatMoney } from "@/lib/commission";
import { prizeLabel, type ContestResults, type ContestStandings } from "@/lib/rewards";
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
              "flex items-start justify-between gap-3 py-2 text-sm",
              me && "font-semibold",
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
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
              {place && (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-6">
                  {place.items.map((item, i) => (
                    <span
                      key={i}
                      className={cn(
                        "flex items-center gap-1 text-xs",
                        item.unlocked ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {item.unlocked ? (
                        <Check className="size-3" />
                      ) : (
                        <Lock className="size-3" />
                      )}
                      {prizeLabel(item, currency)}
                      {!item.unlocked && (
                        <span className="text-muted-foreground">
                          (
                          {place.holder && !place.thresholdMet && place.min_sales !== null
                            ? `needs ${formatMoney(place.min_sales, currency)}`
                            : "needs store goal"}
                          )
                        </span>
                      )}
                    </span>
                  ))}
                </span>
              )}
              {place &&
                place.holder &&
                !place.thresholdMet &&
                place.min_sales !== null &&
                place.min_sales > 0 && (
                  <span className="flex items-center gap-2 pl-6">
                    <span className="bg-muted h-1.5 w-24 overflow-hidden rounded-full">
                      <span
                        className="bg-primary block h-full rounded-full"
                        style={{
                          width: `${Math.round(Math.min(1, place.holder.amount / place.min_sales) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatMoney(Math.max(0, place.min_sales - place.holder.amount), currency)}{" "}
                      to the minimum
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

/**
 * The employee's own second bar: distance to the minimum attached to the
 * place they currently hold (the store-goal bar is GateProgress).
 */
export function MyPlaceProgress({
  standings,
  employeeId,
  currency,
}: {
  standings: ContestStandings;
  employeeId: string;
  currency: string;
}) {
  const me = standings.ranking.find((r) => r.employeeId === employeeId);
  if (!me) return null;
  const place = standings.places.find((p) => p.place === me.place);
  if (!place || place.min_sales === null || place.min_sales <= 0) return null;

  const met = me.amount >= place.min_sales;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">
          {met ? (
            <Check className="text-primary size-4" />
          ) : (
            <Lock className="text-muted-foreground size-4" />
          )}
          Your minimum for {me.place === 1 ? "1st" : me.place === 2 ? "2nd" : me.place === 3 ? "3rd" : `${me.place}th`} place
        </span>
        <span className="text-muted-foreground tabular-nums">
          {met
            ? "done"
            : `${formatMoney(place.min_sales - me.amount, currency)} to go`}
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${Math.round(Math.min(1, me.amount / place.min_sales) * 100)}%` }}
        />
      </div>
    </div>
  );
}
