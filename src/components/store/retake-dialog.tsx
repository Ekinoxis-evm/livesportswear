"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Receipt, ShoppingBag, UserX, X } from "lucide-react";
import {
  storeRetake,
  storeRetakeCandidates,
  type RetakeCandidate,
} from "@/server/store-floor";
import type { RecentOrder } from "@/lib/shopify";
import { storeRecentOrders } from "@/server/store-floor";
import { formatMoney } from "@/lib/commission";
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

export type FloorMember = { employeeId: string; name: string };

type Outcome = "sold" | "nosale";

/**
 * Re-take: a client this rep already attended today came back. Whatever happens
 * — they buy more, or leave without buying — it folds into the attendance she
 * ALREADY logged, so the same person is never counted twice against conversion.
 */
export function RetakeDialog({
  open,
  members,
  onClose,
}: {
  open: boolean;
  members: FloorMember[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(0);
  const [member, setMember] = useState<FloorMember | null>(null);
  const [candidates, setCandidates] = useState<RetakeCandidate[] | null>(null);
  const [event, setEvent] = useState<RetakeCandidate | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [orders, setOrders] = useState<RecentOrder[] | null>(null);
  const [selected, setSelected] = useState<RecentOrder[]>([]);
  const [gotContact, setGotContact] = useState(false);

  function reset() {
    setStep(0);
    setMember(null);
    setCandidates(null);
    setEvent(null);
    setOutcome(null);
    setOrders(null);
    setSelected([]);
    setGotContact(false);
  }

  function pickMember(m: FloorMember) {
    setMember(m);
    setCandidates(null);
    start(async () => {
      const res = await storeRetakeCandidates(m.employeeId);
      setCandidates(res.ok ? (res.data ?? []) : []);
      if (!res.ok) toast.error(res.error);
    });
    setStep(1);
  }

  function pickEvent(c: RetakeCandidate) {
    setEvent(c);
    setStep(2);
  }

  function pickOutcome(o: Outcome) {
    setOutcome(o);
    if (o === "sold" && orders === null) {
      // Fetched on demand — never on the 45s refresh loop.
      void storeRecentOrders().then((res) => setOrders(res.ok ? (res.data ?? []) : []));
    }
    setStep(3);
  }

  const toggleOrder = (o: RecentOrder) =>
    setSelected((cur) =>
      cur.some((x) => x.id === o.id) ? cur.filter((x) => x.id !== o.id) : [...cur, o],
    );

  function submit() {
    if (!member || !event || !outcome) return;
    start(async () => {
      const res = await storeRetake({
        employeeId: member.employeeId,
        eventId: event.id,
        sold: outcome === "sold",
        gotContact,
        orders:
          outcome === "sold"
            ? selected.map((o) => ({
                id: o.id,
                name: o.name,
                total: o.net,
                customer_id: o.customer?.id ?? null,
                customer_name: o.customer?.name ?? null,
              }))
            : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        outcome === "sold"
          ? `Added to ${member.name}'s client — no extra walk-in counted.`
          : `Logged ${member.name}'s return visit — no extra walk-in counted.`,
      );
      reset();
      onClose();
      router.refresh();
    });
  }

  const total = selected.reduce((s, o) => s + o.net, 0);

  const steps = [
    {
      title: "Who",
      content: (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Who is re-taking a client they already attended today?
          </p>
          {members.map((m) => (
            <Button
              key={m.employeeId}
              size="lg"
              variant={member?.employeeId === m.employeeId ? "default" : "outline"}
              className="h-14 justify-start"
              disabled={pending}
              onClick={() => pickMember(m)}
            >
              {m.name}
            </Button>
          ))}
        </div>
      ),
      validate: () => member !== null,
    },
    {
      title: "Which client",
      content: (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Pick the client {member?.name} already attended.
          </p>
          {candidates === null ? (
            <p className="text-muted-foreground py-4 text-sm">Loading…</p>
          ) : candidates.length === 0 ? (
            <p className="text-muted-foreground py-4 text-sm">
              No clients logged today for {member?.name} yet.
            </p>
          ) : (
            candidates.map((c) => (
              <Button
                key={c.id}
                size="lg"
                variant={event?.id === c.id ? "default" : "outline"}
                className="h-auto justify-start py-3"
                disabled={pending}
                onClick={() => pickEvent(c)}
              >
                <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
                  <span className="flex items-center gap-2 font-semibold">
                    {c.time}
                    {c.sold ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600">
                        <Check className="size-3.5" /> sold
                      </span>
                    ) : (
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        <X className="size-3.5" /> no sale
                      </span>
                    )}
                    {c.isReturn && <span className="text-amber-600">return</span>}
                  </span>
                  <span className="text-muted-foreground truncate text-xs font-normal">
                    {c.customer ?? "no customer linked"}
                    {c.orderName ? ` · ${c.orderName}` : ""}
                    {c.orderTotal ? ` · ${formatMoney(c.orderTotal)}` : ""}
                  </span>
                </span>
              </Button>
            ))
          )}
        </div>
      ),
      validate: () => event !== null,
    },
    {
      title: "Outcome",
      content: (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            What happened when they came back?
          </p>
          <Button
            size="lg"
            variant={outcome === "sold" ? "default" : "outline"}
            className="h-16 justify-start gap-3"
            disabled={pending}
            onClick={() => pickOutcome("sold")}
          >
            <ShoppingBag className="size-5" />
            <span className="flex flex-col items-start leading-tight">
              Bought something
              <span className="text-xs font-normal opacity-80">
                add the order(s) to this client
              </span>
            </span>
          </Button>
          <Button
            size="lg"
            variant={outcome === "nosale" ? "default" : "outline"}
            className="h-16 justify-start gap-3"
            disabled={pending}
            onClick={() => pickOutcome("nosale")}
          >
            <UserX className="size-5" />
            <span className="flex flex-col items-start leading-tight">
              Came back — no sale
              <span className="text-xs font-normal opacity-80">
                re-logged without a second walk-in
              </span>
            </span>
          </Button>
        </div>
      ),
      validate: () => outcome !== null,
    },
    {
      title: outcome === "nosale" ? "Contact" : "Order",
      content:
        outcome === "nosale" ? (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              They didn&apos;t buy — nothing is double-counted. Did you get their
              contact this time?
            </p>
            <Button
              size="lg"
              variant={gotContact ? "default" : "outline"}
              className="h-14 justify-start gap-2.5"
              disabled={pending}
              onClick={() => setGotContact((v) => !v)}
            >
              {gotContact ? <Check className="size-4" /> : <UserX className="size-4" />}
              Got their contact this time
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              Tap what they just bought. It&apos;s added to this client — the earlier
              amount isn&apos;t replaced.
            </p>
            {orders === null ? (
              <p className="text-muted-foreground py-4 text-sm">Loading orders…</p>
            ) : (
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
                {orders.map((o) => {
                  const on = selected.some((x) => x.id === o.id);
                  return (
                    <Button
                      key={o.id}
                      size="lg"
                      variant={on ? "default" : "outline"}
                      className="h-14 justify-start gap-2.5"
                      disabled={pending}
                      onClick={() => toggleOrder(o)}
                    >
                      {on ? (
                        <Check className="size-4 shrink-0" />
                      ) : (
                        <Receipt className="size-4 shrink-0" />
                      )}
                      <span className="flex min-w-0 flex-col items-start leading-tight">
                        <span className="font-semibold tabular-nums">
                          {o.name} · {formatMoney(o.net, o.currency ?? "USD")}
                        </span>
                        <span className="truncate text-xs font-normal opacity-80">
                          {o.createdAt.slice(11, 16)} ·{" "}
                          {o.customer?.name ?? "no customer on the order"}
                        </span>
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}
            {selected.length > 0 && (
              <p className="text-sm font-semibold tabular-nums">
                {selected.length} order{selected.length === 1 ? "" : "s"} ·{" "}
                {formatMoney(total)}
              </p>
            )}
          </div>
        ),
    },
  ];

  const finishLabel =
    outcome === "nosale"
      ? "Save visit"
      : selected.length > 0
        ? "Add to client"
        : "Mark as sold";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className={cn("max-w-lg", "flex max-h-[85vh] flex-col")}>
        <DialogHeader>
          <DialogTitle>Re-take a client</DialogTitle>
          <DialogDescription>
            Folds a returning client into the attendance already logged today,
            instead of counting them as a new walk-in.
          </DialogDescription>
        </DialogHeader>
        <Wizard
          steps={steps}
          step={step}
          onStepChange={setStep}
          onFinish={submit}
          finishLabel={finishLabel}
          pending={pending}
          pendingLabel="Saving…"
        />
      </DialogContent>
    </Dialog>
  );
}
