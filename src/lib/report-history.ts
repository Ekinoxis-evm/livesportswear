/**
 * The recent-days view behind the report history table.
 *
 * Merges three sources keyed on business date — what happened on the floor
 * (conversion counts), whether the day was closed (the snapshot), and every
 * send that went out — into one row per day, newest first.
 *
 * The point of the table is the days that are MISSING, so a date with floor
 * activity and no send has to appear as a row, not be absent. That is exactly
 * the case that stayed invisible for five days.
 *
 * Pure: no DB, no clock. The caller passes the dates it cares about.
 */
export type DayCounts = {
  businessDate: string;
  attended: number;
  sold: number;
  contacts: number;
  checkins: number;
};

export type DayClose = {
  businessDate: string;
  netSales: number | null;
  currency: string | null;
  closedAt: string;
};

export type DaySend = {
  businessDate: string;
  sentAt: string;
  kind: "close" | "resend";
};

export type ReportHistoryRow = {
  businessDate: string;
  attended: number;
  sold: number;
  /** null when nobody was attended — a rate over zero clients is meaningless. */
  conversion: number | null;
  contacts: number;
  netSales: number | null;
  currency: string | null;
  closed: boolean;
  sendCount: number;
  lastSentAt: string | null;
  /** No send on a day that saw floor activity — the case worth surfacing. */
  missing: boolean;
};

export function buildReportHistory(input: {
  dates: string[];
  counts: DayCounts[];
  closes: DayClose[];
  sends: DaySend[];
}): ReportHistoryRow[] {
  const countBy = new Map(input.counts.map((c) => [c.businessDate, c]));
  const closeBy = new Map(input.closes.map((c) => [c.businessDate, c]));
  const sendsBy = new Map<string, DaySend[]>();
  for (const s of input.sends) {
    const list = sendsBy.get(s.businessDate) ?? [];
    list.push(s);
    sendsBy.set(s.businessDate, list);
  }

  return [...new Set(input.dates)]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((businessDate) => {
      const c = countBy.get(businessDate);
      const close = closeBy.get(businessDate);
      const sends = sendsBy.get(businessDate) ?? [];
      const attended = c?.attended ?? 0;
      const lastSentAt = sends.reduce<string | null>(
        (latest, s) => (latest === null || s.sentAt > latest ? s.sentAt : latest),
        null,
      );
      // A day nobody worked isn't "missing" a report — there was nothing to report.
      const hadActivity = attended > 0 || (c?.checkins ?? 0) > 0;

      return {
        businessDate,
        attended,
        sold: c?.sold ?? 0,
        conversion: attended > 0 ? (c?.sold ?? 0) / attended : null,
        contacts: c?.contacts ?? 0,
        netSales: close?.netSales ?? null,
        currency: close?.currency ?? null,
        closed: close !== undefined,
        sendCount: sends.length,
        lastSentAt,
        missing: hadActivity && sends.length === 0,
      };
    });
}
