import { formatMoney } from "@/lib/commission";

/**
 * Sales-contest standings. Pure — no DB, no clock; `today` is always injected
 * as the location-local business date. The store threshold is a GATE: while
 * storeTotal (the sum of attributed sales, so the board and the gate can never
 * disagree) is below it, nobody wins regardless of individual numbers. Places
 * are 1-based and each may carry its own optional minimum.
 */

export const GARMENT_KINDS = [
  "bra",
  "t-shirt",
  "shorts",
  "leggings",
  "jacket",
  "hoodie",
  "socks",
  "cap",
  "other",
] as const;
export type GarmentKind = (typeof GARMENT_KINDS)[number];

/** One thing a place wins. `requires_goal` items unlock only when the store gate passes. */
export type PrizeItem =
  | { type: "cash"; amount: number; requires_goal: boolean }
  | { type: "clothing"; garments: GarmentKind[]; qty: number; requires_goal: boolean }
  | { type: "other"; label: string; requires_goal: boolean };

export type ContestPrize = { place: number; min_sales: number | null; items: PrizeItem[] };

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
  min_sales: number | null;
  items: (PrizeItem & { unlocked: boolean })[];
  holder: RankedEmployee | null; // null when fewer employees than places
  thresholdMet: boolean;
  winning: boolean; // any item unlocked
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
      const items = p.items.map((item) => ({
        ...item,
        unlocked: thresholdMet && (item.requires_goal ? gatePassed : true),
      }));
      return {
        place: p.place,
        min_sales: p.min_sales,
        items,
        holder,
        thresholdMet,
        winning: items.some((i) => i.unlocked),
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
    prizes: string[]; // human labels of the items actually won
    won: boolean;
  }[];
};

/** Human label for one prize item ("$200" / "2× bra, t-shirt" / "Free day off"). */
export function prizeLabel(item: PrizeItem, currency: string): string {
  switch (item.type) {
    case "cash":
      return formatMoney(item.amount, currency);
    case "clothing":
      return `${item.qty > 1 ? `${item.qty}× ` : ""}${item.garments.join(", ")}`;
    case "other":
      return item.label;
  }
}

export function placeLabelList(items: PrizeItem[], currency: string): string {
  return items.map((i) => prizeLabel(i, currency)).join(" + ");
}

export function buildResults(
  s: ContestStandings,
  finalizedOn: string,
  currency: string,
): ContestResults {
  const byPlace = new Map(s.places.map((p) => [p.place, p]));
  return {
    finalized_on: finalizedOn,
    store_total: s.storeTotal,
    gate_passed: s.gatePassed,
    standings: s.ranking.map((r) => {
      const p = byPlace.get(r.place);
      const prizes = (p?.items ?? [])
        .filter((i) => i.unlocked)
        .map((i) => prizeLabel(i, currency));
      return {
        employee_id: r.employeeId,
        name: r.name,
        amount: r.amount,
        place: r.place,
        prizes,
        won: prizes.length > 0,
      };
    }),
  };
}

function asItem(value: unknown): PrizeItem | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.requires_goal !== "boolean") return null;
  if (v.type === "cash" && typeof v.amount === "number" && v.amount >= 0) {
    return { type: "cash", amount: v.amount, requires_goal: v.requires_goal };
  }
  if (
    v.type === "clothing" &&
    Array.isArray(v.garments) &&
    typeof v.qty === "number" &&
    v.qty >= 1
  ) {
    const garments = v.garments.filter((g): g is GarmentKind =>
      (GARMENT_KINDS as readonly string[]).includes(g as string),
    );
    if (garments.length === 0) return null;
    return { type: "clothing", garments, qty: v.qty, requires_goal: v.requires_goal };
  }
  if (v.type === "other" && typeof v.label === "string" && v.label.length > 0) {
    return { type: "other", label: v.label, requires_goal: v.requires_goal };
  }
  return null;
}

/**
 * Normalize jsonb into v2 prizes. The pre-items shape ({place, prize, min_sales})
 * coerces — never drops — to one fully-gated "other" item, so legacy contests
 * stay renderable and editable before the 0027 data migration runs.
 */
export function asPrizes(value: unknown): ContestPrize[] {
  if (!Array.isArray(value)) return [];
  const out: ContestPrize[] = [];
  for (const p of value) {
    if (typeof p !== "object" || p === null) continue;
    const v = p as Record<string, unknown>;
    if (typeof v.place !== "number") continue;
    const min_sales =
      typeof v.min_sales === "number" ? v.min_sales : null;
    if (Array.isArray(v.items)) {
      const items = v.items.map(asItem).filter((i): i is PrizeItem => i !== null);
      if (items.length > 0) out.push({ place: v.place, min_sales, items });
    } else if (typeof v.prize === "string") {
      out.push({
        place: v.place,
        min_sales,
        items: [{ type: "other", label: v.prize, requires_goal: true }],
      });
    }
  }
  return out;
}

/**
 * Coerce jsonb into a results snapshot; null when it isn't one. Accepts both
 * snapshot generations — v1 entries carried `prize: string | null`.
 */
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
  return {
    ...v,
    standings: v.standings.map((s) => {
      if (Array.isArray(s.prizes)) return s;
      const legacy = (s as { prize?: string | null }).prize;
      return { ...s, prizes: legacy ? [legacy] : [] };
    }),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
