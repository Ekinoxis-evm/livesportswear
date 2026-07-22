"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Receipt, UserX, X } from "lucide-react";
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

/**
 * Re-take: a client this rep already attended today came back and bought. The
 * sale is added to the attendance she ALREADY logged, so the same person isn't
 * counted twice against conversion.
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
  const [orders, setOrders] = useState<RecentOrder[] | null>(null);
  const [order, setOrder] = useState<RecentOrder | null>(null);

  function reset() {
    setStep(0);
    setMember(null);
    setCandidates(null);
    setEvent(null);
    setOrders(null);
    setOrder(null);
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
    setOrders(null);
    // Fetched on demand — never on the 45s refresh loop.
    void storeRecentOrders().then((res) => setOrders(res.ok ? (res.data ?? []) : []));
    setStep(2);
  }

  function submit() {
    if (!member || !event) return;
    start(async () => {
      const res = await storeRetake({
        employeeId: member.employeeId,
        eventId: event.id,
        order: order
          ? {
              id: order.id,
              name: order.name,
              total: order.net,
              customer_id: order.customer?.id ?? null,
              customer_name: order.customer?.name ?? null,
              customer_email: order.customer?.email ?? null,
              customer_phone: order.customer?.phone ?? null,
            }
          : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added to ${member.name}'s client — no extra walk-in counted.`);
      reset();
      onClose();
      router.refresh();
    });
  }

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
      title: "Order",
      content: (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-sm">
            Link what they just bought. It&apos;s added to the sale already on this
            client — the earlier amount isn&apos;t replaced.
          </p>
          {orders === null ? (
            <p className="text-muted-foreground py-4 text-sm">Loading orders…</p>
          ) : (
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {orders.map((o, i) => (
                <Button
                  key={o.id}
                  size="lg"
                  variant={order?.id === o.id ? "default" : i === 0 ? "secondary" : "outline"}
                  className="h-14 justify-start gap-2.5"
                  disabled={pending}
                  onClick={() => setOrder(o)}
                >
                  <Receipt className="size-4 shrink-0" />
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
              ))}
            </div>
          )}
          <Button
            size="lg"
            variant={order === null && orders !== null ? "secondary" : "outline"}
            className="h-14 justify-start gap-2.5"
            disabled={pending}
            onClick={() => setOrder(null)}
          >
            <UserX className="size-4 shrink-0" />
            <span className="flex flex-col items-start leading-tight">
              <span className="font-semibold">No order to link</span>
              <span className="text-xs font-normal opacity-80">
                just mark this client as sold
              </span>
            </span>
          </Button>
        </div>
      ),
    },
  ];

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
      <DialogContent className={cn("max-w-md", "flex max-h-[85vh] flex-col")}>
        <DialogHeader>
          <DialogTitle>Re-take a client</DialogTitle>
          <DialogDescription>
            Adds the sale to a client already attended today, instead of counting
            them as a new walk-in.
          </DialogDescription>
        </DialogHeader>
        <Wizard
          steps={steps}
          step={step}
          onStepChange={setStep}
          onFinish={submit}
          finishLabel="Add to client"
          pending={pending}
          pendingLabel="Saving…"
        />
      </DialogContent>
    </Dialog>
  );
}
