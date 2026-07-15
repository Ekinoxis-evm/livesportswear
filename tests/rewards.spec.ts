import { describe, expect, it } from "vitest";
import {
  asPrizes,
  asResults,
  buildResults,
  computeStandings,
  contestStatus,
  type Contest,
  type ContestSale,
} from "@/lib/rewards";

const CONTEST: Contest = {
  id: "c1",
  name: "July push",
  start_date: "2026-07-01",
  end_date: "2026-07-14",
  store_threshold: 10000,
  prizes: [
    { place: 1, prize: "$300", min_sales: 3000 },
    { place: 2, prize: "$150", min_sales: null },
    { place: 3, prize: "$50", min_sales: 1000 },
  ],
};

const SALES: ContestSale[] = [
  { employeeId: "e1", name: "Maryna", amount: 5200 },
  { employeeId: "e2", name: "Veriana", amount: 4100 },
  { employeeId: "e3", name: "Estefani", amount: 900 },
  { employeeId: "e4", name: "Karla", amount: 0 },
];

describe("contestStatus", () => {
  it("is upcoming before the start date", () => {
    expect(contestStatus(CONTEST, "2026-06-30")).toBe("upcoming");
  });
  it("is active from the start date", () => {
    expect(contestStatus(CONTEST, "2026-07-01")).toBe("active");
  });
  it("is still active on the end date", () => {
    expect(contestStatus(CONTEST, "2026-07-14")).toBe("active");
  });
  it("is ended the day after the end date", () => {
    expect(contestStatus(CONTEST, "2026-07-15")).toBe("ended");
  });
});

describe("computeStandings — gate", () => {
  it("blocks every prize while the store total is below the threshold", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-10");
    expect(s.storeTotal).toBe(10200);
    expect(s.gatePassed).toBe(true);
    const short = computeStandings(
      { ...CONTEST, store_threshold: 20000 },
      SALES,
      "2026-07-10",
    );
    expect(short.gatePassed).toBe(false);
    expect(short.gateRemaining).toBe(9800);
    expect(short.places.every((p) => !p.winning)).toBe(true);
  });
  it("passes at exactly the threshold", () => {
    const s = computeStandings(
      { ...CONTEST, store_threshold: 10200 },
      SALES,
      "2026-07-10",
    );
    expect(s.gatePassed).toBe(true);
    expect(s.gateRemaining).toBe(0);
    expect(s.gateProgress).toBe(1);
  });
  it("treats a zero threshold as always passed", () => {
    const s = computeStandings(
      { ...CONTEST, store_threshold: 0 },
      [],
      "2026-07-10",
    );
    expect(s.gatePassed).toBe(true);
    expect(s.gateProgress).toBe(1);
  });
});

describe("computeStandings — ranking", () => {
  it("sorts descending and keeps $0 employees on the board", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-10");
    expect(s.ranking.map((r) => r.name)).toEqual([
      "Maryna",
      "Veriana",
      "Estefani",
      "Karla",
    ]);
    expect(s.ranking[3].amount).toBe(0);
  });
  it("breaks ties by name with distinct sequential places", () => {
    const tied: ContestSale[] = [
      { employeeId: "a", name: "Zoe", amount: 100 },
      { employeeId: "b", name: "Ana", amount: 100 },
    ];
    const s = computeStandings(CONTEST, tied, "2026-07-10");
    expect(s.ranking.map((r) => [r.name, r.place])).toEqual([
      ["Ana", 1],
      ["Zoe", 2],
    ]);
  });
  it("reports the delta needed to overtake the employee above", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-10");
    expect(s.ranking[0].toNextPlace).toBeNull();
    expect(s.ranking[1].toNextPlace).toBe(1100);
  });
});

describe("computeStandings — places", () => {
  it("assigns holders by rank and applies per-place minimums", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-10");
    expect(s.places[0].holder?.name).toBe("Maryna");
    expect(s.places[0].winning).toBe(true); // 5200 >= 3000 min
    expect(s.places[1].winning).toBe(true); // no minimum
    expect(s.places[2].holder?.name).toBe("Estefani");
    expect(s.places[2].thresholdMet).toBe(false); // 900 < 1000 min
    expect(s.places[2].winning).toBe(false);
  });
  it("leaves holders null when there are fewer employees than places", () => {
    const s = computeStandings(CONTEST, SALES.slice(0, 1), "2026-07-10");
    expect(s.places[1].holder).toBeNull();
    expect(s.places[1].winning).toBe(false);
  });
  it("handles an empty roster without blowing up", () => {
    const s = computeStandings(CONTEST, [], "2026-07-10");
    expect(s.storeTotal).toBe(0);
    expect(s.ranking).toEqual([]);
    expect(s.places.every((p) => p.holder === null)).toBe(true);
  });
});

describe("buildResults", () => {
  it("freezes winners and marks everyone else prize-less", () => {
    const s = computeStandings(CONTEST, SALES, "2026-07-15");
    const r = buildResults(s, "2026-07-15");
    expect(r.gate_passed).toBe(true);
    expect(r.standings[0]).toMatchObject({
      name: "Maryna",
      place: 1,
      prize: "$300",
      won: true,
    });
    expect(r.standings[2]).toMatchObject({
      name: "Estefani",
      prize: null,
      won: false,
    });
    expect(r.standings[3]).toMatchObject({ prize: null, won: false });
  });
});

describe("jsonb coercers", () => {
  it("asPrizes drops invalid entries and non-arrays", () => {
    expect(asPrizes(null)).toEqual([]);
    expect(asPrizes("nope")).toEqual([]);
    expect(
      asPrizes([
        { place: 1, prize: "cash", min_sales: null },
        { place: "1", prize: "bad" },
        { place: 2, prize: "trip", min_sales: 500 },
      ]),
    ).toHaveLength(2);
  });
  it("asResults rejects malformed snapshots", () => {
    expect(asResults(null)).toBeNull();
    expect(asResults({ finalized_on: "2026-07-15" })).toBeNull();
    const s = computeStandings(CONTEST, SALES, "2026-07-15");
    const r = buildResults(s, "2026-07-15");
    expect(asResults(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
});
