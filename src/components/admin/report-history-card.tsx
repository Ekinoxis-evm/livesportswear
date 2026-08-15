"use client";

import { resendReport } from "@/server/report-recipients";
import { ReportHistory } from "@/components/shared/report-history";
import type { ReportHistoryRow } from "@/lib/report-history";

/** Admin binding — location-scoped by `requireAdmin` + the access check. */
export function ReportHistoryCard({
  locationId,
  rows,
  currency,
}: {
  locationId: string;
  rows: ReportHistoryRow[];
  currency: string;
}) {
  return (
    <ReportHistory
      rows={rows}
      currency={currency}
      resend={(business_date) => resendReport({ location_id: locationId, business_date })}
    />
  );
}
