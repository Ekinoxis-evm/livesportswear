"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Paperclip, Plus, X } from "lucide-react";
import {
  storeCloseDayDraft,
  storeCloseDay,
  storeSendTestReport,
} from "@/server/store-floor";
import type { CloseDayDraft } from "@/server/conversion-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Wizard } from "@/components/shared/wizard";
import { cn } from "@/lib/utils";

export type CloserEntry = { id: string; name: string };

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col rounded-lg border p-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * One wizard, two sends. The steps are identical so a rep learns a single flow;
 * only the last action differs — the test changes nothing, the close writes the
 * day's snapshot and ends the floor's queue.
 */
export function ReportWizard({
  mode,
  closers,
  onDone,
  onCancel,
}: {
  mode: "test" | "close";
  closers: CloserEntry[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CloseDayDraft | null>(null);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [closer, setCloser] = useState<CloserEntry | null>(closers[0] ?? null);

  // The draft is built for whoever is currently selected; the metrics don't
  // depend on them, so loading once against the first closer is enough.
  if (draft === null && !pending && closers.length > 0) {
    start(async () => {
      const res = await storeCloseDayDraft(closers[0].id);
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Could not build the report." : res.error);
        onCancel();
        return;
      }
      setDraft(res.data);
    });
  }

  const all = draft?.recipients ?? [];
  const selected = all.filter((e) => !dropped.has(e));

  const toggle = (email: string) =>
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });

  function submit() {
    if (!closer || !draft) return;
    start(async () => {
      const res =
        mode === "close"
          ? await storeCloseDay(closer.id, selected)
          : await storeSendTestReport(selected);
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(
        mode === "close" ? "Day closed — report sent." : "Test report sent.",
      );
      onDone();
      router.refresh();
    });
  }

  const steps = [
    {
      title: "Recipients",
      content: (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Everyone on the list gets it. Remove someone for this send only — the
            saved list isn&apos;t changed.
          </p>
          {all.length === 0 ? (
            <p className="text-sm text-amber-600">
              No recipients configured — add one before sending.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {all.map((email) => {
                const on = !dropped.has(email);
                return (
                  <button
                    key={email}
                    type="button"
                    onClick={() => toggle(email)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      on ? "hover:bg-muted" : "border-dashed opacity-50",
                    )}
                  >
                    <span className="truncate">{email}</span>
                    {on ? (
                      <X className="text-muted-foreground size-4 shrink-0" />
                    ) : (
                      <Plus className="text-muted-foreground size-4 shrink-0" />
                    )}
                  </button>
                );
              })}
              <p className="text-muted-foreground text-xs">
                Sending to {selected.length} of {all.length}.
              </p>
            </div>
          )}
        </div>
      ),
      validate: () => all.length > 0,
    },
    {
      title: "Numbers",
      content: draft ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Attended" value={draft.attended} />
            <Metric label="Sold" value={draft.sold} />
            <Metric label="Conversion" value={draft.conversionPct} />
            <Metric label="Contacts" value={draft.contacts} />
            <Metric label="Sales value" value={draft.grossSales ?? "—"} />
            <Metric label="Discounts" value={draft.discounts ?? "—"} />
            <Metric label="Returns value" value={draft.returnsValue ?? "—"} />
            <Metric label="Net sales" value={draft.shopifySales ?? "—"} />
            <Metric label="Orders" value={draft.shopifyOrders ?? "—"} />
            <Metric label="Cash received" value={draft.cashReceived ?? "—"} />
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg border p-3 text-sm">
            <span className="font-medium">
              {mode === "test" ? `[TEST] ${draft.subject}` : draft.subject}
            </span>
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Paperclip className="size-3.5 shrink-0" />
              CSV + XLSX + PDF · {draft.eventCount} clients · {draft.checkinCount}{" "}
              check-ins
            </span>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground py-6 text-sm">Building the report…</p>
      ),
    },
    {
      title: "Sending",
      content: (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            Who is sending this? Defaults to whoever is on the floor now.
          </p>
          {closers.map((c) => (
            <Button
              key={c.id}
              size="lg"
              variant={closer?.id === c.id ? "default" : "outline"}
              className="h-14 justify-start"
              disabled={pending}
              onClick={() => setCloser(c)}
            >
              {c.name}
            </Button>
          ))}
          <div className="flex items-start gap-1.5 rounded-lg border p-3 text-sm">
            <Mail className="mt-0.5 size-3.5 shrink-0" />
            <span className="text-muted-foreground">
              {selected.join(", ")}
            </span>
          </div>
          {mode === "close" && (
            <p className="text-muted-foreground text-xs">
              Closing ends today&apos;s queue. Everyone still needs to tap their
              own PIN check-out.
            </p>
          )}
        </div>
      ),
      validate: () => closer !== null,
    },
  ];

  return (
    <Wizard
      steps={steps}
      step={step}
      onStepChange={setStep}
      onFinish={submit}
      finishLabel={mode === "close" ? "Send & close day" : "Send test"}
      pending={pending}
      pendingLabel="Sending…"
    />
  );
}

/** The two big buttons that open the wizard. */
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
      {!alreadyClosed && closers.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Closing needs someone on shift &amp; checked in.
        </p>
      )}

      <Dialog open={mode !== null} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-md flex-col">
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
              onDone={() => setMode(null)}
              onCancel={() => setMode(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
