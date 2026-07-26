"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Mail, Paperclip, Plus, X } from "lucide-react";
import type { CloseDayDraft } from "@/server/conversion-core";
import type { ActionResult } from "@/server/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Wizard } from "@/components/shared/wizard";
import { cn } from "@/lib/utils";

export type CloserEntry = { id: string; name: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 *
 * Step 1 starts from the stored recipient list and lets the closer drop or add
 * an address FOR THIS SEND — the saved list isn't touched (`resolveRecipients`
 * on the server keeps it a list of valid emails).
 */
export function ReportWizard({
  mode,
  closers = [],
  loadDraft,
  send,
  onDone,
  onCancel,
}: {
  mode: "test" | "close";
  /** Kiosk only — admin has no "who is sending" step. */
  closers?: CloserEntry[];
  loadDraft: () => Promise<ActionResult<CloseDayDraft>>;
  send: (args: {
    closerId?: string;
    recipients: string[];
    signatories?: string[];
  }) => Promise<ActionResult<unknown>>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CloseDayDraft | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  // Several on-floor reps can sign the report; the first is the recorded closer.
  const [signerIds, setSignerIds] = useState<string[]>(
    closers[0] ? [closers[0].id] : [],
  );
  const signers = closers.filter((c) => signerIds.includes(c.id));
  const toggleSigner = (id: string) =>
    setSignerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // The draft loads once, in an effect — building it during render kept
  // re-triggering the transition and the wizard spun forever.
  useEffect(() => {
    let live = true;
    loadDraft()
      .then((res) => {
        if (!live) return;
        if (res.ok && res.data) setDraft(res.data);
        else {
          setLoadError(true);
          toast.error(res.ok ? "Could not build the report." : res.error);
        }
      })
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, [loadDraft]);

  const stored = draft?.recipients ?? [];
  const norm = (e: string) => e.trim().toLowerCase();
  const selected = [
    ...stored.filter((e) => !dropped.has(norm(e))),
    ...added,
  ];

  const toggle = (email: string) =>
    setDropped((prev) => {
      const next = new Set(prev);
      const key = norm(email);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function addEmail() {
    const email = norm(newEmail);
    if (!EMAIL_RE.test(email)) {
      toast.error("Enter a valid email.");
      return;
    }
    if (!selected.some((e) => norm(e) === email)) setAdded((a) => [...a, email]);
    setNewEmail("");
  }

  function submit() {
    if (!draft) return;
    if (closers.length > 0 && signers.length === 0) return;
    start(async () => {
      const res = await send({
        closerId: signers[0]?.id,
        recipients: selected,
        signatories: signers.map((s) => s.name),
      });
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

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <p className="text-muted-foreground text-sm">Couldn&apos;t build the report.</p>
        <Button variant="outline" onClick={onCancel}>
          Close
        </Button>
      </div>
    );
  }

  if (!draft) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        Building the report…
      </p>
    );
  }

  const steps = [
    {
      title: "Recipients",
      content: (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground text-sm">
            These get today&apos;s report. Remove or add someone for this send —
            the saved list stays as it is.
          </p>
          <div className="flex flex-col gap-2">
            {stored.map((email) => {
              const on = !dropped.has(norm(email));
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
            {added.map((email) => (
              <button
                key={email}
                type="button"
                onClick={() => setAdded((a) => a.filter((e) => e !== email))}
                className="border-primary/40 flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm hover:bg-muted"
              >
                <span className="truncate">
                  {email} <span className="text-muted-foreground text-xs">· added</span>
                </span>
                <X className="text-muted-foreground size-4 shrink-0" />
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              type="email"
              inputMode="email"
              placeholder="Add an email for this send…"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addEmail();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addEmail}>
              <Plus className="size-4" /> Add
            </Button>
          </div>

          <p className="text-muted-foreground text-xs">
            Sending to {selected.length} recipient{selected.length === 1 ? "" : "s"}.
          </p>
        </div>
      ),
      validate: () => selected.length > 0,
    },
    {
      title: "Numbers",
      content: (
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
            <span className="text-muted-foreground text-xs">Subject</span>
            <span className="font-medium">
              {mode === "test" ? `[TEST] ${draft.subject}` : draft.subject}
            </span>
            <span className="text-muted-foreground mt-1 flex items-center gap-1.5">
              <Paperclip className="size-3.5 shrink-0" />
              CSV + XLSX + PDF · {draft.eventCount} clients · {draft.checkinCount}{" "}
              check-ins
            </span>
          </div>
        </div>
      ),
    },
    ...(closers.length === 0
      ? []
      : [
          {
            title: "Sending",
            content: (
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  Who is sending this? Pick everyone who worked the floor — they all
                  sign the report. The first is the recorded closer.
                </p>
                {closers.map((c) => {
                  const on = signerIds.includes(c.id);
                  return (
                    <Button
                      key={c.id}
                      size="lg"
                      variant={on ? "default" : "outline"}
                      className="h-14 justify-between"
                      disabled={pending}
                      onClick={() => toggleSigner(c.id)}
                    >
                      <span>{c.name}</span>
                      {on ? (
                        <Check className="size-4" />
                      ) : (
                        <Plus className="size-4 opacity-60" />
                      )}
                    </Button>
                  );
                })}
                {signers.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    Signed by {signers.map((s) => s.name).join(", ")}.
                  </p>
                )}
                <div className="flex items-start gap-1.5 rounded-lg border p-3 text-sm">
                  <Mail className="mt-0.5 size-3.5 shrink-0" />
                  <span className="text-muted-foreground">{selected.join(", ")}</span>
                </div>
                {mode === "close" && (
                  <p className="text-muted-foreground text-xs">
                    Closing ends today&apos;s queue. Everyone still taps their own
                    PIN check-out.
                  </p>
                )}
              </div>
            ),
            validate: () => signers.length > 0,
          },
        ]),
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
