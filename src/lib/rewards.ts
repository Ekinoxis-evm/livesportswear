/**
 * Sales-contest standings. Pure — no DB, no clock; `today` is always injected
 * as the location-local business date. The store threshold is a GATE: while
 * storeTotal (the sum of attributed sales, so the board and the gate can never
 * disagree) is below it, nobody wins regardless of individual numbers. Places
 * are 1-based and each may carry its own optional minimum.
 */

export type ContestPrize = { place: number; prize: string; min_sales: number | null };

export type Contest = {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD, location-local
  end_date: string; // inclusive
  store_threshold: number;
  prizes: ContestPrize[];
};

export type ContestSale = { employeeId: string; name: string; amount: number };

export type RankedEmployee = {
  employeeId: string;
  name: string;
  amount: number;
  place: number; // 1-based; ties broken by name so places stay deterministic
  toNextPlace: number | null; // delta to overtake the employee above; null for #1
};

export type PlaceStanding = {
  place: number;
  prize: string;
  min_sales: number | null;
  holder: RankedEmployee | null; // null when fewer employees than places
  thresholdMet: boolean;
  winning: boolean; // gatePassed && thresholdMet
};

export type ContestStatus = "upcoming" | "active" | "ended";

export type ContestStandings = {
  status: ContestStatus;
  storeTotal: number;
  gatePassed: boolean;
  gateRemaining: number;
  gateProgress: number; // clamped 0..1; 1 when the threshold is 0
  ranking: RankedEmployee[];
  places: PlaceStanding[];
};

export function contestStatus(
  c: Pick<Contest, "start_date" | "end_date">,
  today: string,
): ContestStatus {
  if (today < c.start_date) return "upcoming";
  if (today > c.end_date) return "ended";
  return "active";
}

export function computeStandings(
  contest: Contest,
  sales: ContestSale[],
  today: string,
): ContestStandings {
  const sorted = [...sales].sort(
    (a, b) => b.amount - a.amount || a.name.localeCompare(b.name),
  );
  const ranking: RankedEmployee[] = sorted.map((s, i) => ({
    employeeId: s.employeeId,
    name: s.name,
    amount: s.amount,
    place: i + 1,
    toNextPlace: i === 0 ? null : round2(sorted[i - 1].amount - s.amount),
  }));

  const storeTotal = round2(sorted.reduce((a, s) => a + s.amount, 0));
  const threshold = contest.store_threshold;
  const gatePassed = storeTotal >= threshold;
  const gateRemaining = round2(Math.max(0, threshold - storeTotal));
  const gateProgress =
    threshold <= 0 ? 1 : Math.min(1, storeTotal / threshold);

  const places: PlaceStanding[] = [...contest.prizes]
    .sort((a, b) => a.place - b.place)
    .map((p) => {
      const holder = ranking[p.place - 1] ?? null;
      const thresholdMet =
        holder !== null && (p.min_sales === null || holder.amount >= p.min_sales);
      return {
        place: p.place,
        prize: p.prize,
        min_sales: p.min_sales,
        holder,
        thresholdMet,
        winning: gatePassed && thresholdMet,
      };
    });

  return {
    status: contestStatus(contest, today),
    storeTotal,
    gatePassed,
    gateRemaining,
    gateProgress,
    ranking,
    places,
  };
}

export type ContestResults = {
  finalized_on: string; // business date the snapshot was taken
  store_total: number;
  gate_passed: boolean;
  standings: {
    employee_id: string;
    name: string;
    amount: number;
    place: number;
    prize: string | null;
    won: boolean;
  }[];
};

export function buildResults(
  s: ContestStandings,
  finalizedOn: string,
): ContestResults {
  const byPlace = new Map(s.places.map((p) => [p.place, p]));
  return {
    finalized_on: finalizedOn,
    store_total: s.storeTotal,
    gate_passed: s.gatePassed,
    standings: s.ranking.map((r) => {
      const p = byPlace.get(r.place);
      const won = p !== undefined && p.winning;
      return {
        employee_id: r.employeeId,
        name: r.name,
        amount: r.amount,
        place: r.place,
        prize: won ? p.prize : null,
        won,
      };
    }),
  };
}

/** Coerce jsonb into a prize array (invalid entries dropped). */
export function asPrizes(value: unknown): ContestPrize[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is ContestPrize =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as ContestPrize).place === "number" &&
      typeof (p as ContestPrize).prize === "string" &&
      (typeof (p as ContestPrize).min_sales === "number" ||
        (p as ContestPrize).min_sales === null),
  );
}

/** Coerce jsonb into a results snapshot; null when it isn't one. */
export function asResults(value: unknown): ContestResults | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as ContestResults;
  if (
    typeof v.finalized_on !== "string" ||
    typeof v.store_total !== "number" ||
    typeof v.gate_passed !== "boolean" ||
    !Array.isArray(v.standings)
  ) {
    return null;
  }
  return v;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
