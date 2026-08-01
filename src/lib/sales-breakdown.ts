/**
 * Shopify's exact sales breakdown, straight from the order money fields (all
 * verified to the penny against Shopify Analytics):
 *
 *   Gross sales − Discounts − Returns = Net sales;  Net sales + Taxes = Total sales
 *
 * `gross` = total_line_items_price (Shopify "Gross sales"), `discounts` =
 * total_discounts, `returns` = subtotal_price − current_subtotal_price (refunded
 * merchandise), `net` = current_subtotal_price (Shopify "Net sales"), `taxes` =
 * total_tax, `total` = net + taxes (Shopify "Total sales" — the register figure;
 * shipping is ~0 for this POS-pickup store, folded in when it appears). Net stays
 * THE metric for goals/commission/contests; the rest is reporting.
 */

export type SalesBreakdown = {
  gross: number;
  discounts: number;
  returns: number;
  net: number;
  taxes: number;
  total: number; // net + taxes (Total sales)
};

export const zeroBreakdown = (): SalesBreakdown => ({
  gross: 0,
  discounts: 0,
  returns: 0,
  net: 0,
  taxes: 0,
  total: 0,
});

export function orderBreakdown(o: {
  total_line_items_price?: string | null;
  total_discounts?: string | null;
  subtotal_price?: string | null;
  current_subtotal_price?: string | null;
  total_tax?: string | null;
}): SalesBreakdown {
  const gross = Number(o.total_line_items_price) || 0;
  const discounts = Number(o.total_discounts) || 0;
  const net = Number(o.current_subtotal_price) || 0;
  const subtotal = Number(o.subtotal_price) || 0;
  const taxes = Number(o.total_tax) || 0;
  return { gross, discounts, returns: subtotal - net, net, taxes, total: net + taxes };
}

export function addBreakdown(
  acc: SalesBreakdown,
  b: SalesBreakdown,
): SalesBreakdown {
  return {
    gross: acc.gross + b.gross,
    discounts: acc.discounts + b.discounts,
    returns: acc.returns + b.returns,
    net: acc.net + b.net,
    taxes: acc.taxes + b.taxes,
    total: acc.total + b.total,
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function roundBreakdown(b: SalesBreakdown): SalesBreakdown {
  return {
    gross: round2(b.gross),
    discounts: round2(b.discounts),
    returns: round2(b.returns),
    net: round2(b.net),
    taxes: round2(b.taxes),
    total: round2(b.total),
  };
}

export function sumBreakdowns(list: SalesBreakdown[]): SalesBreakdown {
  return roundBreakdown(list.reduce(addBreakdown, zeroBreakdown()));
}
