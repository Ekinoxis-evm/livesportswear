/**
 * Pure rollups turning monthly_sales rows into zero-filled Jan–Dec chart
 * series. Employee ids are the dataKeys (names can collide); display name and
 * color travel in the series metadata.
 */

export type MonthlySaleRow = {
  employee_id: string;
  month: string; // YYYY-MM
  amount: number;
};

export type RepSeriesMeta = { key: string; name: string; color: string | null };

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function monthIndex(month: string, year: number): number | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  if (Number(month.slice(0, 4)) !== year) return null;
  const m = Number(month.slice(5, 7));
  return m >= 1 && m <= 12 ? m - 1 : null;
}

/**
 * Zero-filled per-rep dataset; only employees with sales in the year get a
 * series. Months after `throughMonth` (1-12; pass the current month for the
 * current year) become null so lines END there instead of diving to $0 for
 * months that haven't happened yet.
 */
export function repMonthlyData(
  rows: MonthlySaleRow[],
  year: number,
  employees: { id: string; name: string; avatar_color: string | null }[],
  throughMonth = 12,
): { series: RepSeriesMeta[]; data: Record<string, number | string | null>[] } {
  const byEmployee = new Map<string, number[]>();
  for (const r of rows) {
    const i = monthIndex(r.month, year);
    if (i === null) continue;
    const months = byEmployee.get(r.employee_id) ?? Array(12).fill(0);
    months[i] += Number(r.amount) || 0;
    byEmployee.set(r.employee_id, months);
  }

  const series: RepSeriesMeta[] = employees
    .filter((e) => (byEmployee.get(e.id) ?? []).some((v) => v > 0))
    .map((e) => ({ key: e.id, name: e.name, color: e.avatar_color }));

  const data = MONTH_LABELS.map((label, i) => {
    const row: Record<string, number | string | null> = { month: label };
    for (const s of series) {
      row[s.key] = i + 1 > throughMonth ? null : (byEmployee.get(s.key)?.[i] ?? 0);
    }
    return row;
  });

  return { series, data };
}

/**
 * Zero-filled store totals per month, with the monthly goal when one is set.
 * Totals after `throughMonth` are null (see repMonthlyData); goals stay — a
 * future target is real information.
 */
export function storeMonthlyData(
  rows: MonthlySaleRow[],
  year: number,
  goals: { month: number; goal_amount: number }[],
  throughMonth = 12,
): { month: string; total: number | null; goal: number | null }[] {
  const totals = Array(12).fill(0) as number[];
  for (const r of rows) {
    const i = monthIndex(r.month, year);
    if (i === null) continue;
    totals[i] += Number(r.amount) || 0;
  }

  const goalByMonth = new Map<number, number>();
  for (const g of goals) {
    if (g.month < 1 || g.month > 12) continue;
    goalByMonth.set(g.month, (goalByMonth.get(g.month) ?? 0) + Number(g.goal_amount));
  }

  return MONTH_LABELS.map((label, i) => ({
    month: label,
    total: i + 1 > throughMonth ? null : totals[i],
    goal: goalByMonth.get(i + 1) ?? null,
  }));
}
