import { formatMoney } from "@/lib/commission";

/**
 * Sales-contest standings, prize-centric (v3). Pure — no DB, no clock;
 * `today` is always injected as the location-local business date.
 *
 * A contest is a flat list of PRIZES. Each prize carries the items you win
 * and its own combinable conditions: a ranking position in the challenge, a
 * minimum sales amount, the store gate, and the personal goal. A prize with
 * no position condition is won by EVERY rep who meets the rest. Amounts are
 * NET sales (after discounts/refunds, excl. taxes+shipping) throughout.
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

/** What you win — pure description; conditions live on the prize. */
export type PrizeItem =
  | { type: "cash"; amount: number }
  | { type: "clothing"; garments: GarmentKind[]; qty: number }
  | { type: "other"; label: string };

export type PrizeConditions = {
  position: number | null; // exact rank in the challenge; null = anyone
  min_sales: number | null; // contest-window amount
  requires_store_goal: boolean;
  requires_personal_goal: boolean;
};

export type ContestPrize = { items: PrizeItem[]; conditions: PrizeConditions };

export type GoalSource = "custom" | "monthly";

export type Contest = {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD, location-local
  end_date: string; // inclusive
  store_threshold: number; // the gate when goal_source is "custom"
  goal_source: GoalSource;
  personal_source: GoalSource; // where personal targets come from
  personal_goals: Record<string, number>; // custom mode: employeeId -> target
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
  personalProgress: number; // the amount measured against the goal (window or month)
  personalMet: boolean; // no goal set => true (the condition can't block them)
};

export type PrizeBlocker = "position" | "min_sales" | "store_goal" | "personal_goal";

export type PrizeStanding = {
  items: PrizeItem[];
  conditions: PrizeConditions;
  /** Per rep: is this prize theirs right now, and if not, why not. */
  eligible: { employeeId: string; unlocked: boolean; blockers: PrizeBlocker[] }[];
  winners: RankedEmployee[];
};

export type ContestStatus = "upcoming" | "active" | "ended";

export type ContestStandings = {
  status: ContestStatus;
  storeTotal: number; // Σ contest-window net sales (the board)
  gate: { source: GoalSource; total: number; threshold: number };
  gatePassed: boolean;
  gateRemaining: number;
  gateProgress: number; // clamped 0..1; 1 when the threshold is 0
  ranking: RankedEmployee[];
  prizes: PrizeStanding[];
};

export type StandingsOverrides = {
  /** Monthly store gate: the end-date month's net total + configured goal. */
  gate?: { total: number; threshold: number };
  /** Monthly personal goals: per rep, their month total + configured goal. */
  personal?: Record<string, { goal: number | null; total: number }>;
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
  overrides?: StandingsOverrides,
): ContestStandings {
  const sorted = [...sales].sort(
    (a, b) => b.amount - a.amount || a.name.localeCompare(b.name),
  );
  const ranking: RankedEmployee[] = sorted.map((s, i) => {
    const monthly = overrides?.personal?.[s.employeeId];
    const personalGoal = monthly
      ? monthly.goal
      : (contest.personal_goals[s.employeeId] ?? null);
    const personalProgress = monthly ? monthly.total : s.amount;
    return {
      employeeId: s.employeeId,
      name: s.name,
      amount: s.amount,
      place: i + 1,
      toNextPlace: i === 0 ? null : round2(sorted[i - 1].amount - s.amount),
      personalGoal,
      personalProgress,
      personalMet: personalGoal === null || personalProgress >= personalGoal,
    };
  });

  const storeTotal = round2(sorted.reduce((a, s) => a + s.amount, 0));
  const gateTotal = overrides?.gate ? overrides.gate.total : storeTotal;
  const threshold = overrides?.gate
    ? overrides.gate.threshold
    : contest.store_threshold;
  const gatePassed = gateTotal >= threshold;
  const gateRemaining = round2(Math.max(0, threshold - gateTotal));
  const gateProgress = threshold <= 0 ? 1 : Math.min(1, gateTotal / threshold);

  const prizes: PrizeStanding[] = contest.prizes.map((p) => {
    const eligible = ranking.map((r) => {
      const blockers: PrizeBlocker[] = [];
      if (p.conditions.position !== null && r.place !== p.conditions.position) {
        blockers.push("position");
      }
      if (p.conditions.min_sales !== null && r.amount < p.conditions.min_sales) {
        blockers.push("min_sales");
      }
      if (p.conditions.requires_store_goal && !gatePassed) {
        blockers.push("store_goal");
      }
      if (p.conditions.requires_personal_goal && !r.personalMet) {
        blockers.push("personal_goal");
      }
      return { employeeId: r.employeeId, unlocked: blockers.length === 0, blockers };
    });
    const winnerIds = new Set(
      eligible.filter((e) => e.unlocked).map((e) => e.employeeId),
    );
    return {
      items: p.items,
      conditions: p.conditions,
      eligible,
      winners: ranking.filter((r) => winnerIds.has(r.employeeId)),
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
    prizes,
  };
}

/** A rep's view: each prize with won/locked + why. Drives the boards. */
export function prizesForEmployee(
  standings: ContestStandings,
  employeeId: string,
): {
  items: PrizeItem[];
  conditions: PrizeConditions;
  unlocked: boolean;
  blockers: PrizeBlocker[];
}[] {
  return standings.prizes.map((p) => {
    const e = p.eligible.find((x) => x.employeeId === employeeId);
    return {
      items: p.items,
      conditions: p.conditions,
      unlocked: e?.unlocked ?? false,
      blockers: e?.blockers ?? (["position"] as PrizeBlocker[]),
    };
  });
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
    prizes: string[]; // human labels of the prizes actually won
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

/** Human summary of a prize's conditions ("1st in the challenge · store goal"). */
export function conditionsLabel(c: PrizeConditions, currency: string): string {
  const parts: string[] = [];
  if (c.position !== null) parts.push(`${ordinal(c.position)} in the challenge`);
  if (c.min_sales !== null && c.min_sales > 0)
    parts.push(`sell ${formatMoney(c.min_sales, currency)}+`);
  if (c.requires_store_goal) parts.push("store goal");
  if (c.requires_personal_goal) parts.push("personal goal");
  return parts.length > 0 ? parts.join(" · ") : "everyone";
}

export function ordinal(n: number): string {
  return n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
}

export function buildResults(
  s: ContestStandings,
  finalizedOn: string,
  currency: string,
): ContestResults {
  return {
    finalized_on: finalizedOn,
    store_total: s.storeTotal,
    gate_passed: s.gatePassed,
    standings: s.ranking.map((r) => {
      const prizes = s.prizes
        .filter((p) => p.winners.some((w) => w.employeeId === r.employeeId))
        .map((p) => placeLabelList(p.items, currency));
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
  if (v.type === "cash" && typeof v.amount === "number" && v.amount >= 0) {
    return { type: "cash", amount: v.amount };
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
    return { type: "clothing", garments, qty: v.qty };
  }
  if (v.type === "other" && typeof v.label === "string" && v.label.length > 0) {
    return { type: "other", label: v.label };
  }
  return null;
}

function asConditions(value: unknown): PrizeConditions {
  const v = (typeof value === "object" && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    position: typeof v.position === "number" && v.position >= 1 ? v.position : null,
    min_sales: typeof v.min_sales === "number" && v.min_sales > 0 ? v.min_sales : null,
    requires_store_goal: v.requires_store_goal === true,
    requires_personal_goal: v.requires_personal_goal === true,
  };
}

/**
 * Normalize jsonb into v3 prizes. Coerces — never drops — the older shapes:
 * v2 places explode (each item becomes one prize carrying the place's
 * position/minimum plus that item's own flags); v1 prize strings become one
 * fully-store-gated "other" prize at their place. Runs on both sides of the
 * 0030 data migration.
 */
export function asPrizes(value: unknown): ContestPrize[] {
  if (!Array.isArray(value)) return [];
  const out: ContestPrize[] = [];
  for (const p of value) {
    if (typeof p !== "object" || p === null) continue;
    const v = p as Record<string, unknown>;
    if (Array.isArray(v.items) && "conditions" in v) {
      // v3
      const items = v.items.map(asItem).filter((i): i is PrizeItem => i !== null);
      if (items.length > 0) {
        out.push({ items, conditions: asConditions(v.conditions) });
      }
    } else if (typeof v.place === "number" && Array.isArray(v.items)) {
      // v2 place → one prize per item, carrying that item's own flags
      const min_sales = typeof v.min_sales === "number" ? v.min_sales : null;
      for (const raw of v.items) {
        const item = asItem(raw);
        if (!item) continue;
        const flags = (raw ?? {}) as Record<string, unknown>;
        out.push({
          items: [item],
          conditions: {
            position: v.place,
            min_sales,
            requires_store_goal: flags.requires_goal === true,
            requires_personal_goal: flags.requires_personal === true,
          },
        });
      }
    } else if (typeof v.place === "number" && typeof v.prize === "string") {
      // v1
      out.push({
        items: [{ type: "other", label: v.prize }],
        conditions: {
          position: v.place,
          min_sales: typeof v.min_sales === "number" ? v.min_sales : null,
          requires_store_goal: true,
          requires_personal_goal: false,
        },
      });
    }
  }
  return out;
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
 * Coerce jsonb into a results snapshot; null when it isn't one. Accepts all
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
