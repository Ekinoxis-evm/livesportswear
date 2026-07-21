import { describe, expect, it } from "vitest";
import {
  personalClientStats,
  personalOrderStats,
  type PersonalOrder,
} from "@/lib/personal-stats";

const order = (o: Partial<PersonalOrder> = {}): PersonalOrder => ({
  day: "2026-07-20",
  net: 100,
  customerId: null,
  customerCreatedDay: null,
  ...o,
});

describe("personalOrderStats", () => {
  it("returns zeros for a period with no orders", () => {
    const s = personalOrderStats([]);
    expect(s).toMatchObject({
      orders: 0,
      net: 0,
      avgTicket: 0,
      daysWithSales: 0,
      bestDay: null,
      maxOrdersDay: null,
    });
  });

  it("averages the ticket across every order", () => {
    const s = personalOrderStats([
      order({ net: 100 }),
      order({ net: 50 }),
      order({ net: 25 }),
    ]);
    expect(s.net).toBe(175);
    expect(s.avgTicket).toBe(58.33);
  });

  it("reports the largest single sale", () => {
    const s = personalOrderStats([order({ net: 40 }), order({ net: 320.5 })]);
    expect(s.largestSale).toBe(320.5);
  });

  it("groups orders into chronological day tallies", () => {
    const s = personalOrderStats([
      order({ day: "2026-07-21", net: 30 }),
      order({ day: "2026-07-19", net: 10 }),
      order({ day: "2026-07-19", net: 20 }),
    ]);
    expect(s.byDay).toEqual([
      { day: "2026-07-19", orders: 2, net: 30 },
      { day: "2026-07-21", orders: 1, net: 30 },
    ]);
    expect(s.daysWithSales).toBe(2);
  });

  it("picks the best day by net, not by order count", () => {
    const s = personalOrderStats([
      order({ day: "2026-07-19", net: 10 }),
      order({ day: "2026-07-19", net: 10 }),
      order({ day: "2026-07-20", net: 500 }),
    ]);
    expect(s.bestDay).toEqual({ day: "2026-07-20", net: 500 });
    expect(s.maxOrdersDay).toEqual({ day: "2026-07-19", orders: 2 });
  });

  it("breaks a tied best day toward the earlier date", () => {
    const s = personalOrderStats([
      order({ day: "2026-07-21", net: 200 }),
      order({ day: "2026-07-19", net: 200 }),
    ]);
    expect(s.bestDay).toEqual({ day: "2026-07-19", net: 200 });
  });

  it("averages per selling day, ignoring days with no sales", () => {
    const s = personalOrderStats([
      order({ day: "2026-07-19", net: 100 }),
      order({ day: "2026-07-21", net: 300 }),
    ]);
    expect(s.avgPerSellingDay).toBe(200);
  });
});

describe("personalClientStats", () => {
  const bounds = { from: "2026-07-01", to: "2026-07-31" };

  it("counts each customer once, however many times they bought", () => {
    const s = personalClientStats(
      [
        order({ customerId: "c1", customerCreatedDay: "2026-07-10" }),
        order({ customerId: "c1", customerCreatedDay: "2026-07-10" }),
      ],
      bounds,
    );
    expect(s).toEqual({ customersServed: 1, newClients: 1, repeatClients: 0 });
  });

  it("ignores walk-ins with no customer record", () => {
    const s = personalClientStats([order(), order()], bounds);
    expect(s).toEqual({ customersServed: 0, newClients: 0, repeatClients: 0 });
  });

  it("counts a customer created before the period as a repeat client", () => {
    const s = personalClientStats(
      [order({ customerId: "c1", customerCreatedDay: "2025-01-04" })],
      bounds,
    );
    expect(s).toEqual({ customersServed: 1, newClients: 0, repeatClients: 1 });
  });

  it("treats the period's first and last day as new", () => {
    const s = personalClientStats(
      [
        order({ customerId: "c1", customerCreatedDay: "2026-07-01" }),
        order({ customerId: "c2", customerCreatedDay: "2026-07-31" }),
        order({ customerId: "c3", customerCreatedDay: "2026-08-01" }),
      ],
      bounds,
    );
    expect(s).toMatchObject({ customersServed: 3, newClients: 2, repeatClients: 1 });
  });
});
