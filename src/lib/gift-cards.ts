import { roundBreakdown, type SalesBreakdown } from "@/lib/sales-breakdown";

/**
 * Shopify Analytics counts a gift card as a LIABILITY, not a sale — the money
 * becomes revenue when the card is redeemed, and the redemption is a tender on
 * the order it pays for. The REST order money we aggregate has no such notion:
 * `total_line_items_price` and `current_subtotal_price` include the gift-card
 * line, so every figure we showed ran high by the card's face value while
 * Shopify's own staff report did not — the mismatch people were seeing.
 *
 * These helpers subtract the gift-card lines back out. Taxes are untouched:
 * gift-card lines are non-taxable, so they contribute nothing to `total_tax`.
 */

export type GiftCardAdjustment = {
  /** Face value sold — the line total before line-level discounts. */
  gross: number;
  /** Discount applied to the gift-card lines (rare, but a card can be on sale). */
  discounts: number;
  /** Gift-card value refunded on this order. */
  returns: number;
};

export const zeroGiftCard = (): GiftCardAdjustment => ({
  gross: 0,
  discounts: 0,
  returns: 0,
});

/** The gift-card share of NET sales — what has to come off `current_subtotal_price`. */
export function giftCardNet(a: GiftCardAdjustment): number {
  return a.gross - a.discounts - a.returns;
}

/** One money figure with its gift-card share taken off, settled to the cent. */
export function subtractGiftCard(value: number, share: number): number {
  return Math.round((value - share) * 100) / 100;
}

/**
 * A breakdown with the order's gift-card lines removed. Net is re-derived from
 * the adjusted parts so the Shopify identity still holds:
 * gross − discounts − returns = net; net + taxes = total.
 */
export function withoutGiftCards(
  b: SalesBreakdown,
  a: GiftCardAdjustment | undefined,
): SalesBreakdown {
  if (!a || (a.gross === 0 && a.discounts === 0 && a.returns === 0)) return b;
  const net = b.net - giftCardNet(a);
  return roundBreakdown({
    gross: b.gross - a.gross,
    discounts: b.discounts - a.discounts,
    returns: b.returns - a.returns,
    net,
    taxes: b.taxes,
    total: net + b.taxes,
  });
}

export type GiftCardOrderNode = {
  id: string;
  cancelledAt: string | null;
  test: boolean;
  lineItems: {
    nodes: {
      product: { isGiftCard: boolean } | null;
      originalTotalSet: { shopMoney: { amount: string } } | null;
      discountedTotalSet: { shopMoney: { amount: string } } | null;
    }[];
  };
  refunds: {
    refundLineItems: {
      nodes: {
        subtotalSet: { shopMoney: { amount: string } } | null;
        lineItem: { product: { isGiftCard: boolean } | null } | null;
      }[];
    } | null;
  }[];
};

const amount = (m: { shopMoney: { amount: string } } | null | undefined) =>
  Number(m?.shopMoney?.amount ?? 0);

/**
 * Folds the gift-card GraphQL nodes into `orderId → adjustment`, keyed by the
 * numeric tail so it joins the REST orders (`order.id`). Cancelled and test
 * orders are dropped here too — the REST sweeps skip them, so an entry for one
 * would never be looked up anyway.
 */
export function giftCardAdjustments(
  nodes: GiftCardOrderNode[],
): Map<string, GiftCardAdjustment> {
  const out = new Map<string, GiftCardAdjustment>();
  for (const o of nodes) {
    if (o.cancelledAt || o.test) continue;
    const adj = zeroGiftCard();
    for (const li of o.lineItems?.nodes ?? []) {
      if (!li.product?.isGiftCard) continue;
      const original = amount(li.originalTotalSet);
      adj.gross += original;
      adj.discounts += original - amount(li.discountedTotalSet);
    }
    for (const r of o.refunds ?? []) {
      for (const rli of r.refundLineItems?.nodes ?? []) {
        if (!rli.lineItem?.product?.isGiftCard) continue;
        adj.returns += amount(rli.subtotalSet);
      }
    }
    if (adj.gross || adj.discounts || adj.returns) {
      out.set(o.id.split("/").pop() ?? o.id, adj);
    }
  }
  return out;
}
