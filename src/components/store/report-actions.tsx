"use client";

import { useState } from "react";
import {
  storeCloseDayDraft,
  storeCloseDay,
  storeSendTestReport,
} from "@/server/store-floor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReportWizard, type CloserEntry } from "@/components/shared/report-wizard";

export type { CloserEntry };

/** The kiosk's two big buttons; both open the same wizard. */
/**
 * Why closing is unavailable. Naming the ACTUAL cause matters: this used to say
 * "Needs someone on shift & checked in" for every reason, so when a week sat
 * unpublished in August 2026 the floor kept re-checking-in — the message sent
 * them to fix the one thing that wasn't broken, and five days of reports were
 * lost before anyone worked it out.
 */
export type BlockedReason = "unpublished" | "nobody-in" | "nobody-scheduled";

const BLOCKED_MESSAGE: Record<BlockedReason, string> = {
  unpublished:
    "Today's schedule isn't published yet — an admin has to publish this week before the day can be closed.",
  "nobody-in": "Whoever closes has to be checked in on the floor first.",
  "nobody-scheduled": "Nobody is scheduled today, so there's no one to close the day.",
};

export function ReportActions({
  closers,
  alreadyClosed,
  blockedReason,
}: {
  closers: CloserEntry[];
  alreadyClosed: boolean;
  blockedReason?: BlockedReason;
}) {
  const [mode, setMode] = useState<"test" | "close" | null>(null);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          variant="outline"
          className="h-16 flex-1 text-base"
          disabled={closers.length === 0}
          onClick={() => setMode("test")}
        >
          Send a test report
        </Button>
        <Button
          size="lg"
          className="h-16 flex-1 text-base"
          disabled={alreadyClosed || closers.length === 0}
          onClick={() => setMode("close")}
        >
          {alreadyClosed ? "Day closed ✓" : "Send close of day"}
        </Button>
      </div>
      {closers.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {BLOCKED_MESSAGE[blockedReason ?? "nobody-in"]}
        </p>
      )}

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col">
          <DialogHeader>
            <DialogTitle>
              {mode === "close" ? "Close the day" : "Send a test report"}
            </DialogTitle>
            <DialogDescription>
              {mode === "close"
                ? "Sends the daily report and ends today's queue."
                : "Sends the same report marked [TEST]. Nothing is recorded."}
            </DialogDescription>
          </DialogHeader>
          {mode && (
            <ReportWizard
              mode={mode}
              closers={closers}
              loadDraft={() => storeCloseDayDraft(closers[0].id)}
              send={({ closerId, recipients, signatories, note }) =>
                mode === "close"
                  ? storeCloseDay(closerId as string, recipients, signatories, note)
                  : storeSendTestReport(recipients, signatories, note)
              }
              onDone={() => setMode(null)}
              onCancel={() => setMode(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
