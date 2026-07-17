"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Paperclip } from "lucide-react";
import { storeCloseDayDraft, storeCloseDay } from "@/server/store-floor";
import type { CloseDayDraft } from "@/server/conversion-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CloserEntry = { id: string; name: string };

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col rounded-lg border p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function CloseDayDialog({
  closers,
  alreadyClosed,
}: {
  closers: CloserEntry[]; // on today's published schedule + checked in
  alreadyClosed: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [closer, setCloser] = useState<CloserEntry | null>(null);
  const [draft, setDraft] = useState<CloseDayDraft | null>(null);

  function loadDraft(c: CloserEntry) {
    start(async () => {
      const res = await storeCloseDayDraft(c.id);
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Could not build the report." : res.error);
        return;
      }
      setCloser(c);
      setDraft(res.data);
    });
  }

  function confirm() {
    if (!closer) return;
    start(async () => {
      const res = await storeCloseDay(closer.id);
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success("Day closed — report sent.");
      setDraft(null);
      setCloser(null);
      router.refresh();
    });
  }

  if (alreadyClosed) {
    return <span className="text-muted-foreground text-sm">Day closed ✓</span>;
  }
  if (closers.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">
        Close needs someone on shift &amp; checked in
      </span>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" disabled={pending}>
              Close day…
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {closers.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => loadDraft(c)}>
              Close as {c.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={draft !== null}
        onOpenChange={(o) => {
          if (!o) {
            setDraft(null);
            setCloser(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          {draft && (
            <>
              <DialogHeader>
                <DialogTitle>Daily Report — draft</DialogTitle>
                <DialogDescription>
                  {draft.businessDateLabel} · closing as {closer?.name}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-2">
                <Metric label="Attended" value={draft.attended} />
                <Metric label="Sold" value={draft.sold} />
                <Metric label="Conversion" value={draft.conversionPct} />
                <Metric label="Contacts" value={draft.contacts} />
                <Metric label="Net sales" value={draft.shopifySales ?? "—"} />
                <Metric label="Orders" value={draft.shopifyOrders ?? "—"} />
                <Metric label="Cash received" value={draft.cashReceived ?? "—"} />
                <Metric label="Refunds" value={draft.refunds ?? "none"} />
                {draft.returns > 0 && (
                  <>
                    <Metric label="Returns" value={draft.returns} />
                    <Metric label="Returns → sale" value={draft.returnExtraSales} />
                  </>
                )}
              </div>

              <div className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
                <span className="font-medium">{draft.subject}</span>
                <span className="text-muted-foreground flex items-start gap-1.5">
                  <Mail className="mt-0.5 size-3.5 shrink-0" />
                  <span>{draft.recipients.join(", ") || "No recipients configured"}</span>
                </span>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Paperclip className="size-3.5 shrink-0" />
                  CSV + XML + PDF attached: {draft.eventCount} clients · {draft.checkinCount} check-ins
                </span>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setDraft(null);
                    setCloser(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={pending || draft.recipients.length === 0}
                  onClick={confirm}
                >
                  Send &amp; close day
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
