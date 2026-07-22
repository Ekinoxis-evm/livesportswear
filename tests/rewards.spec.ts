import { describe, expect, it } from "vitest";
import {
  asPersonalGoals,
  asPrizes,
  asResults,
  buildResults,
  computeStandings,
  conditionsLabel,
  contestStatus,
  prizeLabel,
  prizesForEmployee,
  type Contest,
  type ContestPrize,
  type ContestSale,
} from "@/lib/rewards";

const cash = (amount: number) => ({ type: "cash", amount }) as const;
const prize = (
  items: ContestPrize["items"],
  conditions: Partial<ContestPrize["conditions"]> = {},
): ContestPrize => ({
  items,
  conditions: {
    position: null,
    min_sales: null,
    requires_store_goal: false,
    requires_personal_goal: false,
    ...conditions,
  },
});

const CONTEST: Contest = {
  id: "c1",
  name: "July push",
  start_date: "2026-07-01",
  end_date: "2026-07-14",
  store_threshold: 10000,
  goal_source: "custom",
  personal_source: "custom",
  personal_goals: {},
  prizes: [
    prize([{ type: "clothing", garments: ["bra", "t-shirt"], qty: 2 }], {
      position: 1,
    }),
    prize([cash(200)], { position: 1, requires_store_goal: true }),
    prize([{ type: "other", label: "Free day off" }], { min_sales: 1000 }),
  ],
};

const SALES: ContestSale[] = [
  { employeeId: "e1", name: "Maryna", amount: 5200 },
  { employeeId: "e2", name: "Veriana", amount: 4100 },
  { employeeId: "e3", name: "Estefani", amount: 900 },
  { employeeId: "e4", name: "Karla", amount: 0 },
];

describe("contestStatus", () => {
  it("is upcoming before, active through, and ended after the date range", () => {
    expect(contestStatus(CONTEST, "2026-06-30")).toBe("upcoming");
    expect(contestStatus(CONTEST, "2026-07-01")).toBe("active");
    expect(contestStatus(CONTEST, "2026-07-14")).toBe("active");
    expect(contestStatus(CONTEST, "2026-07-15")).toBe("ended");
  });
});

describe("computeStandings — prize conditions", () => {
  it("a position prize goes only to the rep holding that rank", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-10");
    expect(s.prizes[0].winners.map((w) => w.name)).toEqual(["Maryna"]);
    const veriana = s.prizes[0].eligible.find((e) => e.employeeId === "e2");
    expect(veriana?.blockers).toEqual(["position"]);
  });

  it("a position-less prize is won by EVERY rep meeting the rest", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-10");
    // min_sales 1000: Maryna 5200 + Veriana 4100 qualify; Estefani 900 + Karla 0 don't
    expect(s.prizes[2].winners.map((w) => w.name)).toEqual(["Maryna", "Veriana"]);
    const estefani = s.prizes[2].eligible.find((e) => e.employeeId === "e3");
    expect(estefani?.blockers).toEqual(["min_sales"]);
  });

  it("store-gated prizes lock while the gate is unmet and unlock when it passes", () => {
    const short = computeStandings(
      { ...CONTEST, store_threshold: 20000 },
      SALES,
      "2026-07-10",
    );
    expect(short.gatePassed).toBe(false);
    expect(short.prizes[1].winners).toEqual([]); // cash: 1st + store goal
    expect(short.prizes[0].winners.map((w) => w.name)).toEqual(["Maryna"]); // ungated
    const ok = computeStandings(CONTEST, SALES, "2026-07-10"); // 10200 >= 10000
    expect(ok.prizes[1].winners.map((w) => w.name)).toEqual(["Maryna"]);
  });

  it("personal-gated prizes measure each rep's own goal", () => {
    const c: Contest = {
      ...CONTEST,
      store_threshold: 0,
      personal_goals: { e1: 6000, e2: 4000 },
      prizes: [prize([cash(100)], { requires_personal_goal: true })],
    };
    const s = computeStandings(c, SALES, "2026-07-10");
    // Maryna 5200 < 6000 goal; Veriana 4100 >= 4000; e3/e4 have no goal (pass)
    expect(s.prizes[0].winners.map((w) => w.name)).toEqual([
      "Veriana",
      "Estefani",
      "Karla",
    ]);
    const maryna = s.prizes[0].eligible.find((e) => e.employeeId === "e1");
    expect(maryna?.blockers).toEqual(["personal_goal"]);
  });

  it("stacks every condition on one prize", () => {
    const c: Contest = {
      ...CONTEST,
      personal_goals: { e1: 1000 },
      prizes: [
        prize([cash(500)], {
          position: 1,
          min_sales: 5000,
          requires_store_goal: true,
          requires_personal_goal: true,
        }),
      ],
    };
    const s = computeStandings(c, SALES, "2026-07-10"); // gate passes at 10200
    expect(s.prizes[0].winners.map((w) => w.name)).toEqual(["Maryna"]);
    const blocked = computeStandings(
      { ...c, store_threshold: 99000 },
      SALES,
      "2026-07-10",
    );
    expect(blocked.prizes[0].winners).toEqual([]);
  });
});

describe("computeStandings — overrides", () => {
  it("monthly gate override drives the gate while the board keeps window amounts", () => {
    const monthly: Contest = { ...CONTEST, goal_source: "monthly" };
    const s = computeStandings(monthly, SALES, "2026-07-10", {
      gate: { total: 60000, threshold: 50000 },
    });
    expect(s.gate).toEqual({ source: "monthly", total: 60000, threshold: 50000 });
    expect(s.gatePassed).toBe(true);
    expect(s.storeTotal).toBe(10200);
  });

  it("monthly personal override measures month totals against monthly goals", () => {
    const c: Contest = {
      ...CONTEST,
      store_threshold: 0,
      personal_source: "monthly",
      prizes: [prize([cash(100)], { requires_personal_goal: true })],
    };
    const s = computeStandings(c, SALES, "2026-07-10", {
      personal: {
        e1: { goal: 12000, total: 12500 }, // month goal beaten
        e2: { goal: 11000, total: 9000 }, // not yet
        e3: { goal: null, total: 500 }, // no goal set
        e4: { goal: null, total: 0 },
      },
    });
    expect(s.ranking[0].personalProgress).toBe(12500);
    expect(s.prizes[0].winners.map((w) => w.name)).toEqual([
      "Maryna",
      "Estefani",
      "Karla",
    ]);
  });
});

describe("buildResults", () => {
  it("freezes each winner's prize labels — multi-winner prizes list everyone", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-15");
    const r = buildResults(s, "2026-07-15", "USD");
    expect(r.standings[0]).toMatchObject({
      name: "Maryna",
      prizes: ["2× bra, t-shirt", "$200.00", "Free day off"],
      won: true,
    });
    expect(r.standings[1]).toMatchObject({
      name: "Veriana",
      prizes: ["Free day off"],
      won: true,
    });
    expect(r.standings[3]).toMatchObject({ prizes: [], won: false });
  });
});

describe("labels", () => {
  it("prizeLabel formats each item type", () => {
    expect(prizeLabel(cash(200), "USD")).toBe("$200.00");
    expect(
      prizeLabel({ type: "clothing", garments: ["bra", "t-shirt"], qty: 2 }, "USD"),
    ).toBe("2× bra, t-shirt");
    expect(prizeLabel({ type: "other", label: "Free day off" }, "USD")).toBe(
      "Free day off",
    );
  });

  it("conditionsLabel summarizes combinations", () => {
    expect(
      conditionsLabel(
        {
          position: 1,
          min_sales: 5000,
          requires_store_goal: true,
          requires_personal_goal: true,
        },
        "USD",
      ),
    ).toBe("1st in the challenge · sell $5,000.00+ · store goal · personal goal");
    expect(
      conditionsLabel(
        { position: null, min_sales: null, requires_store_goal: false, requires_personal_goal: false },
        "USD",
      ),
    ).toBe("everyone");
  });
});

describe("prizesForEmployee", () => {
  it("returns each prize with won/locked and reasons for one rep", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-10");
    const mine = prizesForEmployee(s, "e2");
    expect(mine[0].unlocked).toBe(false);
    expect(mine[0].blockers).toEqual(["position"]);
    expect(mine[2].unlocked).toBe(true);
  });
});

describe("jsonb coercers", () => {
  it("passes v3 through and validates conditions", () => {
    const out = asPrizes([
      {
        items: [{ type: "cash", amount: 100 }],
        conditions: { position: 2, min_sales: null },
      },
    ]);
    expect(out).toEqual([
      {
        items: [{ type: "cash", amount: 100 }],
        conditions: {
          position: 2,
          min_sales: null,
          requires_store_goal: false,
          requires_personal_goal: false,
        },
      },
    ]);
  });

  it("explodes a v2 place into one prize per item, carrying its flags", () => {
    const out = asPrizes([
      {
        place: 1,
        min_sales: 3000,
        items: [
          { type: "clothing", garments: ["bra"], qty: 1, requires_goal: false, requires_personal: false },
          { type: "cash", amount: 200, requires_goal: true, requires_personal: true },
        ],
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      items: [{ type: "clothing", garments: ["bra"], qty: 1 }],
      conditions: {
        position: 1,
        min_sales: 3000,
        requires_store_goal: false,
        requires_personal_goal: false,
      },
    });
    expect(out[1].conditions).toMatchObject({
      position: 1,
      requires_store_goal: true,
      requires_personal_goal: true,
    });
  });

  it("wraps a v1 prize string as one store-gated prize at its place", () => {
    const out = asPrizes([{ place: 1, prize: "$300 bonus", min_sales: 3000 }]);
    expect(out).toEqual([
      {
        items: [{ type: "other", label: "$300 bonus" }],
        conditions: {
          position: 1,
          min_sales: 3000,
          requires_store_goal: true,
          requires_personal_goal: false,
        },
      },
    ]);
  });

  it("drops garbage entries and invalid items", () => {
    const out = asPrizes([
      { items: [{ type: "nope" }], conditions: {} },
      "garbage",
      { items: [cash(50)], conditions: {} },
    ]);
    expect(out).toHaveLength(1);
  });

  it("coerces a v1 results snapshot and passes v3 through", () => {
    const v1 = {
      finalized_on: "2026-07-15",
      store_total: 9000,
      gate_passed: false,
      standings: [
        { employee_id: "e1", name: "M", amount: 1, place: 1, prize: "$300", won: true },
        { employee_id: "e2", name: "V", amount: 0, place: 2, prize: null, won: false },
      ],
    };
    const out = asResults(JSON.parse(JSON.stringify(v1)));
    expect(out?.standings[0].prizes).toEqual(["$300"]);
    expect(out?.standings[1].prizes).toEqual([]);

    const s = computeStandings(CONTEST, SALES, "2026-07-15");
    const v3 = buildResults(s, "2026-07-15", "USD");
    expect(asResults(JSON.parse(JSON.stringify(v3)))).toEqual(v3);
  });

  it("asPersonalGoals keeps positive numbers and drops garbage", () => {
    expect(asPersonalGoals({ e1: 6000, e2: 0, e3: "nope", e4: -5 })).toEqual({
      e1: 6000,
    });
    expect(asPersonalGoals(null)).toEqual({});
    expect(asPersonalGoals([1, 2])).toEqual({});
  });

  it("rejects malformed snapshots", () => {
    expect(asResults(null)).toBeNull();
    expect(asResults({ finalized_on: "2026-07-15" })).toBeNull();
  });
});
