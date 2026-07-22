"use client";

import {
  storeAddReportRecipient,
  storeRemoveReportRecipient,
  storeSendTestReport,
  storeReportDraft,
} from "@/server/store-floor";
import { RecipientsManager } from "@/components/shared/recipients-manager";

export function KioskReportRecipientsCard({ recipients }: { recipients: string[] }) {
  return (
    <RecipientsManager
      description="Who gets this store's Close-Day report. Add or remove anyone."
      recipients={recipients}
      add={(email) => storeAddReportRecipient(email)}
      remove={(email) => storeRemoveReportRecipient(email)}
      sendTest={(recipients) => storeSendTestReport(recipients)}
      loadDraft={() => storeReportDraft()}
    />
  );
}
