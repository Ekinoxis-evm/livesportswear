import { describe, expect, it } from "vitest";
import {
  asPersonalGoals,
  asPrizes,
  asResults,
  buildResults,
  computeStandings,
  contestStatus,
  prizeLabel,
  type Contest,
  type ContestSale,
  type PrizeItem,
} from "@/lib/rewards";

const cash = (
  amount: number,
  requires_goal = false,
  requires_personal = false,
): PrizeItem => ({ type: "cash", amount, requires_goal, requires_personal });
const clothing = (
  garments: ("bra" | "t-shirt" | "shorts")[],
  qty = 1,
  requires_goal = false,
): PrizeItem => ({
  type: "clothing",
  garments,
  qty,
  requires_goal,
  requires_personal: false,
});

const CONTEST: Contest = {
  id: "c1",
  name: "July push",
  start_date: "2026-07-01",
  end_date: "2026-07-14",
  store_threshold: 10000,
  goal_source: "custom",
  personal_goals: {},
  prizes: [
    {
      place: 1,
      min_sales: 3000,
      items: [clothing(["bra", "t-shirt"], 2), cash(200, true)],
    },
    { place: 2, min_sales: null, items: [cash(100, true)] },
    {
      place: 3,
      min_sales: 1000,
      items: [
        {
          type: "other",
          label: "Free day off",
          requires_goal: false,
          requires_personal: false,
        },
      ],
    },
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

describe("computeStandings — per-item gating", () => {
  it("unlocks non-gated items on rank alone while gated items stay locked", () => {
    const short = computeStandings(
      { ...CONTEST, store_threshold: 20000 }, // gate NOT reached (total 10200)
      SALES,
      "2026-07-10",
    );
    expect(short.gatePassed).toBe(false);
    const first = short.places[0];
    expect(first.items[0].unlocked).toBe(true); // clothing, always
    expect(first.items[1].unlocked).toBe(false); // cash, needs goal
    expect(first.winning).toBe(true); // any item unlocked
    expect(short.places[1].winning).toBe(false); // only a gated item
  });

  it("unlocks gated items once the store total passes the threshold", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-10"); // total 10200 >= 10000
    expect(s.gatePassed).toBe(true);
    expect(s.places[0].items.every((i) => i.unlocked)).toBe(true);
    expect(s.places[1].items[0].unlocked).toBe(true);
  });

  it("locks every item while the place minimum is unmet, regardless of the gate", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-10");
    const third = s.places[2]; // Estefani 900 < 1000 min
    expect(third.thresholdMet).toBe(false);
    expect(third.items.every((i) => !i.unlocked)).toBe(true);
    expect(third.winning).toBe(false);
  });

  it("treats a zero threshold as gate always passed", () => {
    const s = computeStandings(
      { ...CONTEST, store_threshold: 0 },
      SALES,
      "2026-07-10",
    );
    expect(s.gatePassed).toBe(true);
    expect(s.gateProgress).toBe(1);
    expect(s.places[1].items[0].unlocked).toBe(true); // gated item unlocked
  });

  it("keeps ranking rules: descending, $0 included, ties by name", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-10");
    expect(s.ranking.map((r) => r.name)).toEqual([
      "Maryna",
      "Veriana",
      "Estefani",
      "Karla",
    ]);
    expect(s.ranking[1].toNextPlace).toBe(1100);
  });
});

describe("computeStandings — personal goals", () => {
  const personal: Contest = {
    ...CONTEST,
    store_threshold: 0,
    personal_goals: { e1: 6000, e2: 4000 },
    prizes: [
      { place: 1, min_sales: null, items: [cash(200, false, true)] },
      { place: 2, min_sales: null, items: [cash(100, false, true), cash(50)] },
    ],
  };

  it("locks a personal-conditioned item until the holder beats their own goal", () => {
    const s = computeStandings(personal, SALES, "2026-07-10");
    // Maryna 5200 < her 6000 goal — the $200 stays locked
    expect(s.ranking[0].personalGoal).toBe(6000);
    expect(s.ranking[0].personalMet).toBe(false);
    expect(s.places[0].items[0].unlocked).toBe(false);
    // Veriana 4100 >= her 4000 goal — the $100 unlocks; the $50 was never conditioned
    expect(s.ranking[1].personalMet).toBe(true);
    expect(s.places[1].items[0].unlocked).toBe(true);
    expect(s.places[1].items[1].unlocked).toBe(true);
  });

  it("treats a rep with no personal goal as passing the condition", () => {
    const s = computeStandings(
      { ...personal, personal_goals: {} },
      SALES,
      "2026-07-10",
    );
    expect(s.ranking[0].personalGoal).toBeNull();
    expect(s.places[0].items[0].unlocked).toBe(true);
  });

  it("requires BOTH conditions when an item is store- and personal-gated", () => {
    const both: Contest = {
      ...personal,
      store_threshold: 20000, // gate NOT reached
      prizes: [{ place: 1, min_sales: null, items: [cash(200, true, true)] }],
      personal_goals: { e1: 1000 }, // personal met (5200 >= 1000)
    };
    const s = computeStandings(both, SALES, "2026-07-10");
    expect(s.places[0].items[0].unlocked).toBe(false); // store gate still blocks
    const gateOk = computeStandings(
      { ...both, store_threshold: 10000 },
      SALES,
      "2026-07-10",
    );
    expect(gateOk.places[0].items[0].unlocked).toBe(true);
  });
});

describe("computeStandings — monthly gate override", () => {
  it("gates on the override while the board keeps contest-window amounts", () => {
    const monthly: Contest = { ...CONTEST, goal_source: "monthly" };
    const s = computeStandings(monthly, SALES, "2026-07-10", {
      total: 60000,
      threshold: 50000,
    });
    expect(s.gate).toEqual({ source: "monthly", total: 60000, threshold: 50000 });
    expect(s.gatePassed).toBe(true);
    expect(s.storeTotal).toBe(10200); // ranking still the contest window
    const short = computeStandings(monthly, SALES, "2026-07-10", {
      total: 40000,
      threshold: 50000,
    });
    expect(short.gatePassed).toBe(false);
    expect(short.gateRemaining).toBe(10000);
  });
});

describe("buildResults", () => {
  it("freezes only unlocked items' labels and derives won from them", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-15");
    const r = buildResults(s, "2026-07-15", "USD");
    expect(r.standings[0]).toMatchObject({
      name: "Maryna",
      place: 1,
      prizes: ["2× bra, t-shirt", "$200"],
      won: true,
    });
    expect(r.standings[2]).toMatchObject({ prizes: [], won: false }); // min unmet
  });
});

describe("prizeLabel", () => {
  it("formats each item type", () => {
    expect(prizeLabel(cash(200), "USD")).toBe("$200");
    expect(prizeLabel(clothing(["bra", "t-shirt"], 2), "USD")).toBe(
      "2× bra, t-shirt",
    );
    expect(prizeLabel(clothing(["shorts"], 1), "USD")).toBe("shorts");
    expect(
      prizeLabel(
        {
          type: "other",
          label: "Free day off",
          requires_goal: true,
          requires_personal: false,
        },
        "USD",
      ),
    ).toBe("Free day off");
  });
});

describe("jsonb coercers", () => {
  it("coerces the pre-items shape into one fully-gated other item", () => {
    const out = asPrizes([{ place: 1, prize: "$300 bonus", min_sales: 3000 }]);
    expect(out).toEqual([
      {
        place: 1,
        min_sales: 3000,
        items: [
          {
            type: "other",
            label: "$300 bonus",
            requires_goal: true,
            requires_personal: false,
          },
        ],
      },
    ]);
  });

  it("validates the new shape and drops invalid items and entries", () => {
    const out = asPrizes([
      { place: 1, min_sales: null, items: [cash(100), { type: "cash" }] },
      { place: 2, min_sales: null, items: [{ type: "nope" }] },
      "garbage",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].items).toEqual([cash(100)]);
  });

  it("drops clothing items whose garments are all unknown", () => {
    const out = asPrizes([
      {
        place: 1,
        min_sales: null,
        items: [
          { type: "clothing", garments: ["hat-not-real"], qty: 1, requires_goal: false },
          cash(50),
        ],
      },
    ]);
    expect(out[0].items).toEqual([cash(50)]);
  });

  it("coerces a v1 results snapshot and passes a v2 one through", () => {
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
    const v2 = buildResults(s, "2026-07-15", "USD");
    expect(asResults(JSON.parse(JSON.stringify(v2)))).toEqual(v2);
  });

  it("rejects malformed snapshots", () => {
    expect(asResults(null)).toBeNull();
    expect(asResults({ finalized_on: "2026-07-15" })).toBeNull();
  });

  it("defaults requires_personal to false on items written before it existed", () => {
    const out = asPrizes([
      { place: 1, min_sales: null, items: [{ type: "cash", amount: 100, requires_goal: true }] },
    ]);
    expect(out[0].items[0]).toMatchObject({ requires_personal: false });
  });

  it("asPersonalGoals keeps positive numbers and drops garbage", () => {
    expect(
      asPersonalGoals({ e1: 6000, e2: 0, e3: "nope", e4: -5 }),
    ).toEqual({ e1: 6000 });
    expect(asPersonalGoals(null)).toEqual({});
    expect(asPersonalGoals([1, 2])).toEqual({});
  });
});
