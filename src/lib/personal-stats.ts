/**
 * One rep's own numbers for a period, derived from their POS orders. Pure —
 * callers resolve store-local days (`formatInTimeZone`) and filter to the rep's
 * staff id before calling in, so nothing here needs a clock or a timezone.
 *
 * Records ("best day", "max orders") are records WITHIN the period handed in,
 * not all-time — the portal labels them that way.
 */

export type PersonalOrder = {
  day: string; // store-local business date, YYYY-MM-DD
  net: number;
  customerId: string | null;
  customerCreatedDay: string | null; // store-local day the customer was created
};

export type DayTally = { day: string; orders: number; net: number };

export type PersonalOrderStats = {
  orders: number;
  net: number;
  avgTicket: number;
  largestSale: number;
  byDay: DayTally[]; // chronological
  bestDay: { day: string; net: number } | null;
  maxOrdersDay: { day: string; orders: number } | null;
  daysWithSales: number;
  avgPerSellingDay: number;
};

export type PersonalClientStats = {
  customersServed: number;
  newClients: number;
  repeatClients: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function personalOrderStats(orders: PersonalOrder[]): PersonalOrderStats {
  const byDay = new Map<string, DayTally>();
  let net = 0;
  let largestSale = 0;

  for (const o of orders) {
    net += o.net;
    if (o.net > largestSale) largestSale = o.net;
    const tally = byDay.get(o.day) ?? { day: o.day, orders: 0, net: 0 };
    tally.orders += 1;
    tally.net += o.net;
    byDay.set(o.day, tally);
  }

  const days = [...byDay.values()]
    .map((d) => ({ ...d, net: round2(d.net) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Ties go to the earlier day — the first time they hit that number.
  let bestDay: DayTally | null = null;
  let maxOrdersDay: DayTally | null = null;
  for (const d of days) {
    if (!bestDay || d.net > bestDay.net) bestDay = d;
    if (!maxOrdersDay || d.orders > maxOrdersDay.orders) maxOrdersDay = d;
  }

  return {
    orders: orders.length,
    net: round2(net),
    avgTicket: orders.length ? round2(net / orders.length) : 0,
    largestSale: round2(largestSale),
    byDay: days,
    bestDay: bestDay ? { day: bestDay.day, net: bestDay.net } : null,
    maxOrdersDay: maxOrdersDay
      ? { day: maxOrdersDay.day, orders: maxOrdersDay.orders }
      : null,
    daysWithSales: days.length,
    avgPerSellingDay: days.length ? round2(net / days.length) : 0,
  };
}

/**
 * Clients behind those orders. "New" = the Shopify customer record was created
 * inside the same window the rep sold to them — the closest thing Shopify
 * offers to "this rep signed this client up" (the Customer object carries no
 * staff attribution). Orders without a customer are walk-ins and count nowhere.
 */
export function personalClientStats(
  orders: PersonalOrder[],
  bounds: { from: string; to: string },
): PersonalClientStats {
  const createdDayOf = new Map<string, string | null>();
  for (const o of orders) {
    if (!o.customerId) continue;
    if (!createdDayOf.has(o.customerId)) {
      createdDayOf.set(o.customerId, o.customerCreatedDay);
    }
  }

  let newClients = 0;
  for (const createdDay of createdDayOf.values()) {
    if (createdDay && createdDay >= bounds.from && createdDay <= bounds.to) {
      newClients += 1;
    }
  }

  return {
    customersServed: createdDayOf.size,
    newClients,
    repeatClients: createdDayOf.size - newClients,
  };
}
