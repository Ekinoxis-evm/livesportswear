"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, Hand, Undo2, Plus, RotateCcw } from "lucide-react";
import {
  storeOpenDay,
  storeTakeClient,
  storeStartReturn,
  storeUndoTake,
  storeSetAvailable,
  storeMakeUpNext,
  storeReorderQueue,
  storeStartBreak,
  storeEndBreak,
  storeFinish,
} from "@/server/store-floor";
import type { FinishInput } from "@/lib/finish-schema";
import {
  FinishDialog,
  type FinishTarget,
} from "@/components/store/finish-dialog";
import { QueueLine } from "@/components/store/queue-line";
import { BreakTimer } from "@/components/store/break-timer";
import { PinPad } from "@/components/store/pin-pad";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SalesRow = {
  employeeId: string;
  name: string;
  avatarColor: string | null;
  state: "up" | "waiting" | "attending" | "break";
  turn: number | null;
  arrivedLabel: string;
  walkins: number; // open walk-in customers
  returns: number; // open returns/exchanges
  breakStartedAt: string | null; // open break, if any
  breakPriorMinutes: number; // closed breaks earlier today
};

type BreakPinFlow = { kind: "start" | "end"; id: string; name: string } | null;

export function SalesBoard({ open, rows }: { open: boolean; rows: SalesRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [finishTarget, setFinishTarget] = useState<FinishTarget | null>(null);
  const [returnPicker, setReturnPicker] = useState(false);
  const [breakPin, setBreakPin] = useState<BreakPinFlow>(null);

  const line = rows.filter((r) => r.state === "up" || r.state === "waiting");
  const attending = rows.filter((r) => r.state === "attending");
  const onBreak = rows.filter((r) => r.state === "break");
  const up = line[0] ?? null;
  // A return shouldn't burn the up-next's turn — the LAST in line is suggested.
  const returnSuggestion = line[line.length - 1] ?? null;

  // Resolves with the outcome so optimistic UI (the drag order) can settle.
  // Refreshes on failure too — a rejected action means the server state
  // diverged from what the screen shows.
  function run(
    action: Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      start(async () => {
        const res = await action;
        if (res.ok) {
          if (okMsg) toast.success(okMsg);
          setFinishTarget(null);
          setReturnPicker(false);
        } else {
          toast.error(res.error ?? "Something went wrong.");
        }
        router.refresh();
        resolve(res.ok);
      });
    });
  }

  const submitBreakPin = (pin: string) => {
    if (!breakPin) return;
    const formData = new FormData();
    formData.set("employeeId", breakPin.id);
    formData.set("pin", pin);
    const action = breakPin.kind === "start" ? storeStartBreak : storeEndBreak;
    void run(
      action(formData),
      breakPin.kind === "start"
        ? `${breakPin.name} is on break.`
        : `${breakPin.name} is back in the line.`,
    ).then(() => setBreakPin(null));
  };

  const submitFinish = (employeeId: string, input: FinishInput) => {
    run(
      storeFinish(employeeId, input),
      input.kind === "return"
        ? input.sold
          ? "Logged: return + extra sale"
          : "Logged: return"
        : input.sold
          ? "Logged: sold"
          : "Logged: no sale",
    );
  };

  const tile = (color: string | null) => (
    <span
      aria-hidden
      className="size-3 shrink-0 rounded-full border"
      style={{ backgroundColor: color ?? "transparent" }}
    />
  );

  if (!open) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14">
          <p className="text-lg font-semibold">The day isn&apos;t open yet</p>
          <Button size="lg" disabled={pending} onClick={() => run(storeOpenDay(), "Day opened.")}>
            <LogIn className="mr-1.5 size-5" /> Open the day
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Up next — the biggest thing on the screen */}
      {up ? (
        <div className="border-primary bg-primary/5 flex flex-col gap-4 rounded-3xl border-2 p-6">
          <span className="text-primary text-xs font-semibold uppercase tracking-wide">
            Up next
          </span>
          <p className="text-4xl font-bold">{up.name}</p>
          <Button
            size="lg"
            className="h-16 w-full text-lg"
            disabled={pending}
            onClick={() => run(storeTakeClient(up.employeeId), "")}
          >
            <Hand className="mr-2 size-6" /> Take client
          </Button>
        </div>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            Nobody available in the line — check someone in on the Check-in tab.
          </CardContent>
        </Card>
      )}

      {/* With client(s) now */}
      {attending.map((r) => {
        // Legacy rows can be status-attending with zeroed counters.
        const openTotal = Math.max(r.walkins + r.returns, 1);
        const walkins = Math.max(r.walkins, r.returns === 0 ? 1 : r.walkins);
        return (
          <div
            key={r.employeeId}
            className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                {openTotal > 1 ? `With ${openTotal} clients` : "With a client"}
                {r.returns > 0 && ` · ${r.returns} return`}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                arrived {r.arrivedLabel}
              </span>
            </div>
            <p className="text-2xl font-bold">{r.name}</p>
            <div className="flex gap-3">
              {walkins > 0 && (
                <Button
                  size="lg"
                  className="h-14 flex-1"
                  disabled={pending}
                  onClick={() =>
                    setFinishTarget({
                      employeeId: r.employeeId,
                      name: r.name,
                      kind: "walkin",
                    })
                  }
                >
                  Finish client
                </Button>
              )}
              {r.returns > 0 && (
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 flex-1"
                  disabled={pending}
                  onClick={() =>
                    setFinishTarget({
                      employeeId: r.employeeId,
                      name: r.name,
                      kind: "return",
                    })
                  }
                >
                  Finish return
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                className="h-14"
                disabled={pending}
                onClick={() => run(storeTakeClient(r.employeeId), "")}
                aria-label={`${r.name} takes one more client`}
              >
                <Plus className="size-5" />
                <span className="ml-1 hidden sm:inline">1 client</span>
              </Button>
            </div>
            {/* Mis-tap escape hatch: closes one client as if it never
                happened — no event recorded, no turn burned. */}
            <div className="flex gap-2">
              {walkins > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={pending}
                  onClick={() =>
                    run(
                      storeUndoTake(r.employeeId, "walkin"),
                      "Removed — nothing recorded.",
                    )
                  }
                >
                  <RotateCcw className="mr-1 size-4" /> Undo client
                </Button>
              )}
              {r.returns > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  disabled={pending}
                  onClick={() =>
                    run(
                      storeUndoTake(r.employeeId, "return"),
                      "Removed — nothing recorded.",
                    )
                  }
                >
                  <RotateCcw className="mr-1 size-4" /> Undo return
                </Button>
              )}
            </div>
          </div>
        );
      })}

      {/* On break — live timers, PIN to come back */}
      {onBreak.map((r) => (
        <div
          key={r.employeeId}
          className="flex items-center justify-between gap-3 rounded-2xl border border-sky-500/40 bg-sky-500/10 p-4"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-sky-600">
              On break
            </span>
            <span className="text-xl font-bold">{r.name}</span>
          </div>
          <div className="flex items-center gap-3">
            {r.breakStartedAt && (
              <BreakTimer
                startedAt={r.breakStartedAt}
                priorMinutes={r.breakPriorMinutes}
              />
            )}
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setBreakPin({ kind: "end", id: r.employeeId, name: r.name })}
            >
              Back (PIN)
            </Button>
          </div>
        </div>
      ))}

      {/* The line — press and drag to reorder */}
      {line.length > 0 && (
        <Card>
          <CardContent className="pt-2">
            <QueueLine
              entries={line.map((r) => ({
                employeeId: r.employeeId,
                name: r.name,
                avatarColor: r.avatarColor,
                arrivedLabel: r.arrivedLabel,
              }))}
              pending={pending}
              onReorder={(ids) => run(storeReorderQueue(ids), "Line reordered.")}
              onMakeUpNext={(id, name) => run(storeMakeUpNext(id), `${name} is up next.`)}
              onStartBreak={(id, name) => setBreakPin({ kind: "start", id, name })}
            />
            {attending.map((r) => (
              <div
                key={r.employeeId}
                className="flex items-center justify-between gap-2 border-t py-3"
              >
                <span className="flex items-center gap-2.5 text-base font-medium opacity-70">
                  <span className="w-6 text-center text-amber-600">●</span>
                  {tile(r.avatarColor)}
                  {r.name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(storeSetAvailable(r.employeeId), "")}
                >
                  Back to line
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Return / exchange entry point */}
      {line.length > 0 && (
        <Button
          variant="outline"
          size="lg"
          className="h-14"
          disabled={pending}
          onClick={() => setReturnPicker(true)}
        >
          <Undo2 className="mr-2 size-5" /> Return / Exchange
        </Button>
      )}

      <FinishDialog
        target={finishTarget}
        pending={pending}
        onSubmit={submitFinish}
        onClose={() => setFinishTarget(null)}
      />

      <PinPad
        open={breakPin !== null}
        title={
          breakPin?.kind === "start"
            ? `${breakPin.name} — start break`
            : `${breakPin?.name ?? ""} — back from break`
        }
        subtitle="Enter your 4-digit PIN"
        pending={pending}
        onSubmit={submitBreakPin}
        onClose={() => setBreakPin(null)}
      />

      <Dialog
        open={returnPicker}
        onOpenChange={(o) => {
          if (!o && !pending) setReturnPicker(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Who takes the return?</DialogTitle>
            <DialogDescription>
              A return doesn&apos;t burn a turn — the last in line is suggested.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {[...line].reverse().map((r) => (
              <Button
                key={r.employeeId}
                variant={r.employeeId === returnSuggestion?.employeeId ? "default" : "outline"}
                size="lg"
                className="h-14 justify-start gap-2.5"
                disabled={pending}
                onClick={() =>
                  run(storeStartReturn(r.employeeId), `${r.name} takes the return.`)
                }
              >
                {tile(r.avatarColor)}
                {r.name}
                {r.employeeId === returnSuggestion?.employeeId && (
                  <span className="ml-auto text-xs opacity-80">suggested</span>
                )}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
