"use client";

import {
  addReportRecipient,
  removeReportRecipient,
  sendTestReport,
} from "@/server/report-recipients";
import { RecipientsManager } from "@/components/shared/recipients-manager";

export function ReportRecipientsCard({
  locationId,
  locationName,
  recipients,
}: {
  locationId: string;
  locationName: string;
  recipients: string[];
}) {
  return (
    <RecipientsManager
      description={`Who gets ${locationName}'s Close-Day report. Add or remove anyone.`}
      recipients={recipients}
      add={(email) => addReportRecipient({ location_id: locationId, email })}
      remove={(email) => removeReportRecipient({ location_id: locationId, email })}
      sendTest={() => sendTestReport({ location_id: locationId })}
    />
  );
}
