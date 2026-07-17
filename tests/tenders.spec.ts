import { describe, expect, it } from "vitest";
import { summarizeTenders } from "@/lib/tenders";

const t = (amount: number, payment_method = "cash") => ({
  amount,
  payment_method,
  processed_at: "2026-07-16T12:00:00-04:00",
});

describe("summarizeTenders", () => {
  it("splits cash from card and totals everything", () => {
    const s = summarizeTenders([
      t(279.27, "cash"),
      t(217.21, "credit_card"),
      t(41.73, "credit_card"),
      t(10, "gift_card"),
    ]);
    expect(s.cashNet).toBe(279.27);
    expect(s.cardNet).toBe(258.94);
    expect(s.otherNet).toBe(10);
    expect(s.totalCollected).toBe(548.21);
    expect(s.refundsCount).toBe(0);
    expect(s.refundsTotal).toBe(0);
  });

  it("aggregates refunds as negative amounts and nets them per method", () => {
    const s = summarizeTenders([
      t(100, "cash"),
      t(-30, "cash"), // cash refund leaves the drawer
      t(200, "credit_card"),
      t(-41.73, "credit_card"),
    ]);
    expect(s.cashNet).toBe(70);
    expect(s.cardNet).toBe(158.27);
    expect(s.refundsTotal).toBe(-71.73);
    expect(s.refundsCount).toBe(2);
    expect(s.totalCollected).toBe(228.27);
  });

  it("handles an empty day", () => {
    expect(summarizeTenders([])).toEqual({
      cashNet: 0,
      cardNet: 0,
      otherNet: 0,
      refundsTotal: 0,
      refundsCount: 0,
      totalCollected: 0,
    });
  });
});
