"use client";

import { storeResendReport } from "@/server/store-floor";
import { ReportHistory } from "@/components/shared/report-history";
import type { ReportHistoryRow } from "@/lib/report-history";

/** Kiosk binding — the location comes from the store JWT, never the client. */
export function StoreReportHistoryCard({
  rows,
  currency,
}: {
  rows: ReportHistoryRow[];
  currency: string;
}) {
  return (
    <ReportHistory
      rows={rows}
      currency={currency}
      density="comfortable"
      resend={(businessDate) => storeResendReport(businessDate)}
    />
  );
}
