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
export function ReportActions({
  closers,
  alreadyClosed,
}: {
  closers: CloserEntry[];
  alreadyClosed: boolean;
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
          Needs someone on shift &amp; checked in.
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
