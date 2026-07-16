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

/**
 * One thing a place wins. `requires_goal` items unlock only when the store
 * gate passes; `requires_personal` items only when the holder beat their own
 * personal goal. The two conditions are independent and can be combined.
 */
type ItemConditions = { requires_goal: boolean; requires_personal: boolean };
export type PrizeItem =
  | ({ type: "cash"; amount: number } & ItemConditions)
  | ({ type: "clothing"; garments: GarmentKind[]; qty: number } & ItemConditions)
  | ({ type: "other"; label: string } & ItemConditions);

export type ContestPrize = { place: number; min_sales: number | null; items: PrizeItem[] };

export type GoalSource = "custom" | "monthly";

export type Contest = {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD, location-local
  end_date: string; // inclusive
  store_threshold: number; // the gate when goal_source is "custom"
  goal_source: GoalSource;
  personal_goals: Record<string, number>; // employeeId -> contest-window target
  prizes: ContestPrize[];
};

export type ContestSale = { employeeId: string; name: string; amount: number };

export type RankedEmployee = {
  employeeId: string;
  name: string;
  amount: number;
  place: number; // 1-based; ties broken by name so places stay deterministic
  toNextPlace: number | null; // delta to overtake the employee above; null for #1
  personalGoal: number | null;
  personalMet: boolean; // no goal set => true (the condition can't block them)
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
  storeTotal: number; // sum of contest-window attributed sales (the board)
  gate: { source: GoalSource; total: number; threshold: number };
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
  // Monthly mode: the caller resolves the month's total + configured goal and
  // the gate measures those instead of the contest window.
  gateOverride?: { total: number; threshold: number },
): ContestStandings {
  const sorted = [...sales].sort(
    (a, b) => b.amount - a.amount || a.name.localeCompare(b.name),
  );
  const ranking: RankedEmployee[] = sorted.map((s, i) => {
    const personalGoal = contest.personal_goals[s.employeeId] ?? null;
    return {
      employeeId: s.employeeId,
      name: s.name,
      amount: s.amount,
      place: i + 1,
      toNextPlace: i === 0 ? null : round2(sorted[i - 1].amount - s.amount),
      personalGoal,
      personalMet: personalGoal === null || s.amount >= personalGoal,
    };
  });

  const storeTotal = round2(sorted.reduce((a, s) => a + s.amount, 0));
  const gateTotal = gateOverride ? gateOverride.total : storeTotal;
  const threshold = gateOverride ? gateOverride.threshold : contest.store_threshold;
  const gatePassed = gateTotal >= threshold;
  const gateRemaining = round2(Math.max(0, threshold - gateTotal));
  const gateProgress = threshold <= 0 ? 1 : Math.min(1, gateTotal / threshold);

  const places: PlaceStanding[] = [...contest.prizes]
    .sort((a, b) => a.place - b.place)
    .map((p) => {
      const holder = ranking[p.place - 1] ?? null;
      const thresholdMet =
        holder !== null && (p.min_sales === null || holder.amount >= p.min_sales);
      const items = p.items.map((item) => ({
        ...item,
        unlocked:
          thresholdMet &&
          (item.requires_goal ? gatePassed : true) &&
          (item.requires_personal ? (holder?.personalMet ?? false) : true),
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
    gate: { source: contest.goal_source, total: gateTotal, threshold },
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
  const conditions = {
    requires_goal: v.requires_goal,
    // Additive field — items written before personal goals existed coerce to
    // "no personal condition".
    requires_personal: v.requires_personal === true,
  };
  if (v.type === "cash" && typeof v.amount === "number" && v.amount >= 0) {
    return { type: "cash", amount: v.amount, ...conditions };
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
    return { type: "clothing", garments, qty: v.qty, ...conditions };
  }
  if (v.type === "other" && typeof v.label === "string" && v.label.length > 0) {
    return { type: "other", label: v.label, ...conditions };
  }
  return null;
}

/** Coerce jsonb into an employeeId -> positive amount map. */
export function asPersonalGoals(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "number" && v > 0) out[k] = v;
  }
  return out;
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
        items: [
          {
            type: "other",
            label: v.prize,
            requires_goal: true,
            requires_personal: false,
          },
        ],
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
