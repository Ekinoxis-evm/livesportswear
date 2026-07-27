import { normalizeStaffId } from "@/lib/shopify-range";
import type { SalesBreakdown } from "@/lib/sales-breakdown";

/**
 * Pure view-model for the public week-share sales chart: turn per-day, per-staff
 * NET sales into a stacked-bar model. Each day's bar height is the store's total
 * net; the coloured stack is the reps' attributed sales; whatever the store sold
 * that isn't attributed to a rep (anonymous walk-ins) is a muted "Other" cap so
 * the bar still equals the true store total. No DB, no network, no clock.
 */

const OTHER_KEY = "__other__";
const EPS = 0.005; // sub-cent noise from rounding is not a real segment

export type DayInput = {
  date: string;
  total: SalesBreakdown; // every order that day
  staff: [staffId: string, sales: SalesBreakdown][]; // POS-attributed only
};

export type StaffMeta = { name: string; color: string };

export type ChartSegment = { key: string; label: string; color: string; net: number };
export type ChartDay = { date: string; total: number; segments: ChartSegment[] };
export type LegendItem = { key: string; label: string; color: string };
export type WeekChart = {
  days: ChartDay[];
  weekMax: number; // largest single-day total, for bar scaling
  weekTotal: number;
  legend: LegendItem[];
  hasSales: boolean;
};

const clamp0 = (n: number) => (n > 0 ? n : 0);

export function buildWeekChart(
  days: DayInput[],
  staffMeta: Map<string, StaffMeta>,
  otherColor: string,
): WeekChart {
  const repWeekNet = new Map<string, { label: string; color: string; net: number }>();
  let anyOther = false;

  const chartDays: ChartDay[] = days.map((d) => {
    const segments: ChartSegment[] = [];
    let attributed = 0;
    for (const [staffId, b] of d.staff) {
      const net = clamp0(b.net);
      if (net < EPS) continue;
      const key = normalizeStaffId(staffId);
      const meta = staffMeta.get(key);
      const label = meta?.name ?? "Other staff";
      const color = meta?.color ?? otherColor;
      segments.push({ key, label, color, net });
      attributed += net;
      const acc = repWeekNet.get(key) ?? { label, color, net: 0 };
      acc.net += net;
      repWeekNet.set(key, acc);
    }
    // Rep segments in a stable order so a colour sits in the same band each day.
    segments.sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));

    const total = clamp0(d.total.net);
    const other = total - attributed;
    if (other > EPS) {
      segments.push({ key: OTHER_KEY, label: "Other", color: otherColor, net: other });
      anyOther = true;
    }
    // The bar can't be shorter than the sum of its segments (rounding guard).
    const barTotal = Math.max(total, attributed);
    return { date: d.date, total: barTotal, segments };
  });

  const weekMax = chartDays.reduce((m, d) => Math.max(m, d.total), 0);
  const weekTotal = chartDays.reduce((s, d) => s + d.total, 0);

  const legend: LegendItem[] = [...repWeekNet.entries()]
    .sort((a, b) => b[1].net - a[1].net || a[1].label.localeCompare(b[1].label))
    .map(([key, v]) => ({ key, label: v.label, color: v.color }));
  if (anyOther) legend.push({ key: OTHER_KEY, label: "Other", color: otherColor });

  return { days: chartDays, weekMax, weekTotal, legend, hasSales: weekTotal > EPS };
}
