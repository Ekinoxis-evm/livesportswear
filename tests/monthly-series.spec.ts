import { describe, expect, it } from "vitest";
import { repMonthlyData, storeMonthlyData } from "@/lib/monthly-series";

const EMPS = [
  { id: "e1", name: "Maryna", avatar_color: "#ff0000" },
  { id: "e2", name: "Veriana", avatar_color: null },
  { id: "e3", name: "Karla", avatar_color: "#00ff00" },
];

describe("repMonthlyData", () => {
  it("zero-fills all twelve months for sparse data", () => {
    const { data } = repMonthlyData(
      [{ employee_id: "e1", month: "2026-06", amount: 500 }],
      2026,
      EMPS,
    );
    expect(data).toHaveLength(12);
    expect(data[5]).toMatchObject({ month: "Jun", e1: 500 });
    expect(data[0]).toMatchObject({ month: "Jan", e1: 0 });
  });

  it("groups amounts under the right employee and month", () => {
    const { series, data } = repMonthlyData(
      [
        { employee_id: "e1", month: "2026-01", amount: 100 },
        { employee_id: "e2", month: "2026-01", amount: 200 },
        { employee_id: "e1", month: "2026-02", amount: 50 },
      ],
      2026,
      EMPS,
    );
    expect(series.map((s) => s.name)).toEqual(["Maryna", "Veriana"]);
    expect(data[0]).toMatchObject({ e1: 100, e2: 200 });
    expect(data[1]).toMatchObject({ e1: 50, e2: 0 });
  });

  it("leaves employees with no sales in the year out of the series", () => {
    const { series } = repMonthlyData(
      [{ employee_id: "e1", month: "2026-03", amount: 10 }],
      2026,
      EMPS,
    );
    expect(series.map((s) => s.key)).toEqual(["e1"]);
  });

  it("ignores rows from other years and malformed months", () => {
    const { series } = repMonthlyData(
      [
        { employee_id: "e1", month: "2025-12", amount: 999 },
        { employee_id: "e2", month: "garbage", amount: 999 },
      ],
      2026,
      EMPS,
    );
    expect(series).toEqual([]);
  });

  it("carries the avatar color into the series metadata", () => {
    const { series } = repMonthlyData(
      [
        { employee_id: "e1", month: "2026-05", amount: 1 },
        { employee_id: "e2", month: "2026-05", amount: 1 },
      ],
      2026,
      EMPS,
    );
    expect(series[0].color).toBe("#ff0000");
    expect(series[1].color).toBeNull();
  });
});

describe("storeMonthlyData", () => {
  it("sums across employees per month", () => {
    const rows = [
      { employee_id: "e1", month: "2026-06", amount: 300 },
      { employee_id: "e2", month: "2026-06", amount: 200 },
      { employee_id: "e1", month: "2026-07", amount: 50 },
    ];
    const data = storeMonthlyData(rows, 2026, []);
    expect(data[5]).toEqual({ month: "Jun", total: 500, goal: null });
    expect(data[6]).toEqual({ month: "Jul", total: 50, goal: null });
    expect(data[0]).toEqual({ month: "Jan", total: 0, goal: null });
  });

  it("maps goals by month number and sums across locations", () => {
    const data = storeMonthlyData([], 2026, [
      { month: 6, goal_amount: 10000 },
      { month: 6, goal_amount: 5000 },
      { month: 7, goal_amount: 12000 },
    ]);
    expect(data[5].goal).toBe(15000);
    expect(data[6].goal).toBe(12000);
    expect(data[0].goal).toBeNull();
  });
});
