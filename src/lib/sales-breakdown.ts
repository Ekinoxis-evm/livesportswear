/**
 * Net-sales decomposition: gross (full-price item value) − discounts − returns
 * = net. Fields map 1:1 to Shopify order money fields; the identity
 * total_line_items_price − total_discounts = subtotal_price and
 * subtotal_price − current_subtotal_price = returned merchandise value was
 * verified exact against live orders. Net stays THE metric everywhere.
 */

export type SalesBreakdown = {
  gross: number;
  discounts: number;
  returns: number;
  net: number;
};

export const zeroBreakdown = (): SalesBreakdown => ({
  gross: 0,
  discounts: 0,
  returns: 0,
  net: 0,
});

export function orderBreakdown(o: {
  total_line_items_price?: string | null;
  total_discounts?: string | null;
  subtotal_price?: string | null;
  current_subtotal_price?: string | null;
}): SalesBreakdown {
  const gross = Number(o.total_line_items_price) || 0;
  const discounts = Number(o.total_discounts) || 0;
  const net = Number(o.current_subtotal_price) || 0;
  const subtotal = Number(o.subtotal_price) || 0;
  return { gross, discounts, returns: subtotal - net, net };
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
  };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function roundBreakdown(b: SalesBreakdown): SalesBreakdown {
  return {
    gross: round2(b.gross),
    discounts: round2(b.discounts),
    returns: round2(b.returns),
    net: round2(b.net),
  };
}

export function sumBreakdowns(list: SalesBreakdown[]): SalesBreakdown {
  return roundBreakdown(list.reduce(addBreakdown, zeroBreakdown()));
}
