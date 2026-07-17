/**
 * Pure aggregation of a day's tender transactions (payments and refunds —
 * refunds are negative amounts). The cash drawer's truth for the close-day
 * report: what came in as cash, what went through cards, what was refunded.
 */

import type { TenderRow } from "@/lib/shopify";

export type TenderSummary = {
  cashNet: number; // cash received minus cash refunds
  cardNet: number;
  otherNet: number;
  refundsTotal: number; // Σ negative amounts (a negative number, 0 if none)
  refundsCount: number;
  totalCollected: number; // net of everything
};

const CARD_METHODS = new Set(["credit_card", "debit_card", "card"]);

export function summarizeTenders(rows: TenderRow[]): TenderSummary {
  let cashNet = 0;
  let cardNet = 0;
  let otherNet = 0;
  let refundsTotal = 0;
  let refundsCount = 0;
  for (const r of rows) {
    if (r.payment_method === "cash") cashNet += r.amount;
    else if (CARD_METHODS.has(r.payment_method)) cardNet += r.amount;
    else otherNet += r.amount;
    if (r.amount < 0) {
      refundsTotal += r.amount;
      refundsCount += 1;
    }
  }
  return {
    cashNet: round2(cashNet),
    cardNet: round2(cardNet),
    otherNet: round2(otherNet),
    refundsTotal: round2(refundsTotal),
    refundsCount,
    totalCollected: round2(cashNet + cardNet + otherNet),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
