import { resolveDateRange } from "@/lib/date-range";
import { weekStart } from "@/lib/scheduling/week";
import { normalizeStaffId } from "@/lib/shopify-range";
import { zeroBreakdown, type SalesBreakdown } from "@/lib/sales-breakdown";

/**
 * The standardized sales-period model: every ranked employee-sales table
 * offers Today · Week · Month · Custom, where Custom reveals date pickers.
 * Pure — range math and row shaping only; fetching stays on each surface.
 */

export type SalesPeriod = "today" | "week" | "month" | "custom";

export type SalesRankRow = {
  name: string;
  store?: string;
  breakdown: SalesBreakdown | null; // null = month synced before the columns
  net: number;
  goalPct?: number | null;
  sharePct?: number | null;
  rate?: number;
  earned?: number;
  nextTierLabel?: string;
};

/** Custom wins whenever dates were submitted; the pill alone also activates it. */
export function resolveSalesPeriod(
  sp: { period?: string; from?: string; to?: string },
  today: string,
  allowed: SalesPeriod[] = ["today", "week", "month", "custom"],
  defaultPeriod?: SalesPeriod,
): { mode: SalesPeriod; from: string; to: string } {
  const fallback = defaultPeriod ?? allowed[0];
  const { from, to } = resolveDateRange(sp, today);
  const wanted: SalesPeriod =
    sp.from || sp.to || sp.period === "custom"
      ? "custom"
      : sp.period === "week"
        ? "week"
        : sp.period === "month"
          ? "month"
          : sp.period === "today"
            ? "today"
            : fallback;
  const mode = allowed.includes(wanted) ? wanted : fallback;
  return { mode, from, to };
}

/** The inclusive date bounds a mode covers (running periods end today). */
export function periodBounds(
  mode: SalesPeriod,
  args: { today: string; from: string; to: string },
): { from: string; to: string } {
  switch (mode) {
    case "today":
      return { from: args.today, to: args.today };
    case "week":
      return { from: weekStart(args.today), to: args.today };
    case "month":
      return { from: `${args.today.slice(0, 7)}-01`, to: args.today };
    case "custom":
      return { from: args.from, to: args.to };
  }
}

/**
 * Rows from live Shopify staff entries: every mapped employee appears, $0
 * included (a quiet period must not make anyone vanish), net-desc.
 */
export function staffRowsFromEntries(
  entries: [staffId: string, sales: SalesBreakdown][],
  mapped: { name: string; shopify_staff_id: string | null; store?: string }[],
): SalesRankRow[] {
  const byStaff = new Map(entries);
  return mapped
    .filter((e) => e.shopify_staff_id)
    .map((e) => {
      const sales =
        byStaff.get(normalizeStaffId(e.shopify_staff_id as string)) ?? zeroBreakdown();
      return { name: e.name, store: e.store, breakdown: sales, net: sales.net };
    })
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
}

/**
 * Rows from the synced monthly_sales table. Breakdown is null for months
 * synced before the decomposition columns existed. Employees without sales
 * appear only when they have a personal goal (or `keepZeros`).
 */
export function monthRows(
  sales: {
    employee_id: string;
    amount: number | string;
    gross_amount?: number | string | null;
    discounts_amount?: number | string | null;
    returns_amount?: number | string | null;
  }[],
  employees: { id: string; name: string; store?: string }[],
  opts: { goals?: Map<string, number>; keepZeros?: boolean } = {},
): SalesRankRow[] {
  const rowBy = new Map(sales.map((s) => [s.employee_id, s]));
  return employees
    .map((e) => {
      const row = rowBy.get(e.id);
      const net = Number(row?.amount ?? 0);
      const breakdown: SalesBreakdown | null =
        row?.gross_amount != null
          ? {
              gross: Number(row.gross_amount),
              discounts: Number(row.discounts_amount ?? 0),
              returns: Number(row.returns_amount ?? 0),
              net,
            }
          : null;
      const goal = opts.goals?.get(e.id) ?? null;
      return {
        name: e.name,
        store: e.store,
        breakdown,
        net,
        goalPct: goal && goal > 0 ? net / goal : null,
      };
    })
    .filter((r) => opts.keepZeros || r.net > 0 || r.goalPct != null)
    .sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
}
