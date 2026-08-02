import { describe, expect, it } from "vitest";
import { orderBreakdown } from "@/lib/sales-breakdown";
import {
  giftCardAdjustments,
  giftCardNet,
  withoutGiftCards,
  type GiftCardOrderNode,
} from "@/lib/gift-cards";

const money = (amount: string) => ({ shopMoney: { amount } });

const node = (
  id: string,
  lines: { giftCard: boolean; original: string; discounted: string }[],
  opts: {
    cancelledAt?: string | null;
    test?: boolean;
    refunds?: { giftCard: boolean; subtotal: string }[];
  } = {},
): GiftCardOrderNode => ({
  id: `gid://shopify/Order/${id}`,
  cancelledAt: opts.cancelledAt ?? null,
  test: opts.test ?? false,
  lineItems: {
    nodes: lines.map((l) => ({
      product: { isGiftCard: l.giftCard },
      originalTotalSet: money(l.original),
      discountedTotalSet: money(l.discounted),
    })),
  },
  refunds: opts.refunds
    ? [
        {
          refundLineItems: {
            nodes: opts.refunds.map((r) => ({
              subtotalSet: money(r.subtotal),
              lineItem: { product: { isGiftCard: r.giftCard } },
            })),
          },
        },
      ]
    : [],
});

describe("giftCardAdjustments", () => {
  it("keys the adjustment by the numeric order id", () => {
    const map = giftCardAdjustments([
      node("7401593733345", [{ giftCard: true, original: "150.00", discounted: "150.00" }]),
    ]);
    expect([...map.keys()]).toEqual(["7401593733345"]);
  });

  it("sums only the gift-card lines, ignoring the garments", () => {
    const map = giftCardAdjustments([
      node("1", [
        { giftCard: false, original: "75.00", discounted: "63.75" },
        { giftCard: true, original: "50.00", discounted: "50.00" },
      ]),
    ]);
    expect(map.get("1")).toEqual({ gross: 50, discounts: 0, returns: 0 });
  });

  it("reads a discounted gift card as gross minus the discounted total", () => {
    const map = giftCardAdjustments([
      node("2", [{ giftCard: true, original: "100.00", discounted: "90.00" }]),
    ]);
    expect(map.get("2")).toEqual({ gross: 100, discounts: 10, returns: 0 });
  });

  it("counts a refunded gift card as a gift-card return", () => {
    const map = giftCardAdjustments([
      node("3", [{ giftCard: true, original: "100.00", discounted: "100.00" }], {
        refunds: [
          { giftCard: false, subtotal: "35.00" },
          { giftCard: true, subtotal: "100.00" },
        ],
      }),
    ]);
    expect(map.get("3")).toEqual({ gross: 100, discounts: 0, returns: 100 });
  });

  it("skips an order with no gift-card line", () => {
    const map = giftCardAdjustments([
      node("4", [{ giftCard: false, original: "75.00", discounted: "75.00" }]),
    ]);
    expect(map.size).toBe(0);
  });

  it.each([
    ["cancelled", { cancelledAt: "2026-07-16T12:00:00Z" }],
    ["test", { test: true }],
  ])("skips a %s order", (_label, opts) => {
    const map = giftCardAdjustments([
      node("5", [{ giftCard: true, original: "50.00", discounted: "50.00" }], opts),
    ]);
    expect(map.size).toBe(0);
  });
});

describe("giftCardNet", () => {
  it("is face value less its discount and any refund", () => {
    expect(giftCardNet({ gross: 100, discounts: 10, returns: 40 })).toBe(50);
  });
});

describe("withoutGiftCards", () => {
  // Live order #10504: a $150 gift card sold alongside a $48 bag, taxed $3.36.
  it("leaves only the merchandise when a gift card shared the order", () => {
    const b = orderBreakdown({
      total_line_items_price: "198.00",
      total_discounts: "0.00",
      subtotal_price: "198.00",
      current_subtotal_price: "198.00",
      total_tax: "3.36",
    });
    expect(withoutGiftCards(b, { gross: 150, discounts: 0, returns: 0 })).toEqual({
      gross: 48,
      discounts: 0,
      returns: 0,
      net: 48,
      taxes: 3.36,
      total: 51.36,
    });
  });

  // Live order #10533: $123 of garments (less $55 off) fully refunded, plus a
  // $72.76 gift card — Shopify counts no net sales here at all.
  it("nets to zero when the only unrefunded line was the gift card", () => {
    const b = orderBreakdown({
      total_line_items_price: "195.76",
      total_discounts: "55.00",
      subtotal_price: "140.76",
      current_subtotal_price: "72.76",
      total_tax: "4.76",
    });
    const out = withoutGiftCards(b, { gross: 72.76, discounts: 0, returns: 0 });
    expect(out.gross).toBe(123);
    expect(out.net).toBe(0);
  });

  it("keeps taxes untouched — gift-card lines are non-taxable", () => {
    const b = orderBreakdown({
      total_line_items_price: "150.00",
      total_discounts: "0.00",
      subtotal_price: "150.00",
      current_subtotal_price: "150.00",
      total_tax: "7.00",
    });
    expect(withoutGiftCards(b, { gross: 100, discounts: 0, returns: 0 }).taxes).toBe(7);
  });

  it("returns the breakdown untouched when the order had no gift card", () => {
    const b = orderBreakdown({
      total_line_items_price: "100.00",
      total_discounts: "0.00",
      subtotal_price: "100.00",
      current_subtotal_price: "100.00",
    });
    expect(withoutGiftCards(b, undefined)).toBe(b);
  });

  it("preserves the Shopify identity: gross − discounts − returns = net", () => {
    const b = orderBreakdown({
      total_line_items_price: "300.00",
      total_discounts: "40.00",
      subtotal_price: "260.00",
      current_subtotal_price: "200.00",
      total_tax: "14.00",
    });
    const out = withoutGiftCards(b, { gross: 80, discounts: 10, returns: 20 });
    expect(out.gross - out.discounts - out.returns).toBe(out.net);
    expect(out.net + out.taxes).toBe(out.total);
  });
});
