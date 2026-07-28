"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LogIn,
  Hand,
  Undo2,
  Plus,
  RotateCcw,
  RefreshCw,
  Coffee,
  MoveRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  storeOpenDay,
  storeTakeClient,
  storeStartReturn,
  storeUndoTake,
  storeSetAvailable,
  storeMakeUpNext,
  storeReorderQueue,
  storeFinish,
} from "@/server/store-floor";
import type { FinishInput } from "@/lib/finish-schema";
import {
  FinishDialog,
  type FinishTarget,
} from "@/components/store/finish-dialog";
import { QueueLine } from "@/components/store/queue-line";
import { RetakeDialog } from "@/components/store/retake-dialog";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { BreakTimer } from "@/components/store/break-timer";
import { ClientTimer } from "@/components/store/client-timer";
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
  avatarUrl: string | null;
  state: "up" | "waiting" | "attending" | "break";
  turn: number | null;
  turns: number; // clients taken today (fairness tally, visible on the line)
  arrivedLabel: string;
  sinceLabel: string; // when they (re)joined the line — the FIFO position
  walkins: number; // open walk-in customers
  returns: number; // open returns/exchanges
  attendingStartedAt: string | null; // oldest open client's take-time (live clock)
  breakStartedAt: string | null; // open break, if any
  breakPriorMinutes: number; // closed breaks earlier today
};

const firstName = (name: string) => name.trim().split(/\s+/)[0];

/** The whole floor in one glance: numbered rotation, then who's busy/away. */
function OrderStrip({
  line,
  attending,
  onBreak,
}: {
  line: SalesRow[];
  attending: SalesRow[];
  onBreak: SalesRow[];
}) {
  if (line.length + attending.length + onBreak.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Turn order">
      {line.map((r, i) => (
        <span key={r.employeeId} className="flex items-center gap-1.5">
          {i > 0 && <MoveRight className="text-muted-foreground size-3.5" aria-hidden />}
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium",
              i === 0 && "border-primary bg-primary text-primary-foreground",
            )}
          >
            <span className="tabular-nums">{i + 1}</span>
            {firstName(r.name)}
          </span>
        </span>
      ))}
      {attending.map((r) => (
        <span
          key={r.employeeId}
          className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-sm font-medium text-amber-700 dark:text-amber-400"
        >
          {firstName(r.name)}
          <span className="tabular-nums opacity-80">
            ·{Math.max(r.walkins + r.returns, 1)}
          </span>
        </span>
      ))}
      {onBreak.map((r) => (
        <span
          key={r.employeeId}
          className="flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 text-sm font-medium text-sky-700 dark:text-sky-400"
        >
          {firstName(r.name)}
          <Coffee className="size-3.5" aria-label="on break" />
        </span>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-muted-foreground -mb-2 text-xs font-semibold uppercase tracking-wide">
      {children}
    </h2>
  );
}

export function SalesBoard({ open, rows }: { open: boolean; rows: SalesRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [finishTarget, setFinishTarget] = useState<FinishTarget | null>(null);
  const [returnPicker, setReturnPicker] = useState(false);
  const [retakeOpen, setRetakeOpen] = useState(false);
  // Which employee's action is in flight. One page-wide `pending` used to
  // disable EVERY button, silently swallowing other reps' taps on a busy
  // floor — per-row busy keeps the rest of the board alive.
  const [busyId, setBusyId] = useState<string | null>(null);

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
    forEmployee?: string,
  ): Promise<boolean> {
    if (forEmployee) setBusyId(forEmployee);
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
        setBusyId(null);
        router.refresh();
        resolve(res.ok);
      });
    });
  }
  const busy = (employeeId: string) => busyId === employeeId;

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
          <div className="flex items-center gap-4">
            <EmployeeAvatar
              name={up.name}
              color={up.avatarColor}
              url={up.avatarUrl}
              className="size-14 text-lg"
            />
            <p className="text-4xl font-bold">{up.name}</p>
          </div>
          <Button
            size="lg"
            className="h-16 w-full text-lg"
            disabled={busy(up.employeeId)}
            onClick={() =>
              run(storeTakeClient(up.employeeId), `${up.name} is with a client.`, up.employeeId)
            }
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

      {/* The whole floor in one glance */}
      <OrderStrip line={line} attending={attending} onBreak={onBreak} />

      {/* With client(s) now */}
      {attending.length > 0 && (
        <SectionLabel>
          With clients ({attending.length})
        </SectionLabel>
      )}
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
              <span className="text-foreground text-sm font-semibold tabular-nums">
                {r.attendingStartedAt ? (
                  <ClientTimer startedAt={r.attendingStartedAt} />
                ) : (
                  <span className="text-muted-foreground text-xs">arrived {r.arrivedLabel}</span>
                )}
              </span>
            </div>
            <p className="text-2xl font-bold">{r.name}</p>
            <div className="flex gap-3">
              {walkins > 0 && (
                <Button
                  size="lg"
                  className="h-14 flex-1"
                  disabled={busy(r.employeeId)}
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
                  disabled={busy(r.employeeId)}
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
                disabled={busy(r.employeeId)}
                onClick={() =>
                  run(
                    storeTakeClient(r.employeeId),
                    `${r.name}: now with ${openTotal + 1} clients.`,
                    r.employeeId,
                  )
                }
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
                  disabled={busy(r.employeeId)}
                  onClick={() =>
                    run(
                      storeUndoTake(r.employeeId, "walkin"),
                      "Removed — nothing recorded.",
                      r.employeeId,
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
                  disabled={busy(r.employeeId)}
                  onClick={() =>
                    run(
                      storeUndoTake(r.employeeId, "return"),
                      "Removed — nothing recorded.",
                      r.employeeId,
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

      {/* On break — live timers; start/end lives on the Check-in tab */}
      {onBreak.length > 0 && <SectionLabel>On break ({onBreak.length})</SectionLabel>}
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
            <span className="text-muted-foreground text-xs">
              back from break on the Check-in tab
            </span>
          </div>
        </div>
      ))}

      {/* The line — press and drag to reorder */}
      {line.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wide">
              The line ({line.length})
            </h2>
            <QueueLine
              entries={line.map((r) => ({
                employeeId: r.employeeId,
                name: r.name,
                avatarColor: r.avatarColor,
                avatarUrl: r.avatarUrl,
                sinceLabel: r.sinceLabel,
                turns: r.turns,
              }))}
              pending={pending}
              onReorder={(ids) => run(storeReorderQueue(ids), "Line reordered.")}
              onMakeUpNext={(id, name) => run(storeMakeUpNext(id), `${name} is up next.`)}
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
                  disabled={busy(r.employeeId)}
                  onClick={() =>
                    run(storeSetAvailable(r.employeeId), "", r.employeeId)
                  }
                >
                  Back to line
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Set apart from the up-next queue so neither gets tapped by mistake.
          The two carry different colours on purpose: at floor speed "return"
          and "re-take" are easy to confuse, and they mean opposite things —
          one starts a new interaction, the other folds into an existing one. */}
      {line.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-t pt-4">
          <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Returns &amp; re-takes
          </p>
          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full border-2 border-amber-500/70 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/30"
            disabled={pending}
            onClick={() => setReturnPicker(true)}
          >
            <Undo2 className="mr-2 size-5" /> Return / Exchange
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-14 w-full border-2 border-violet-500/70 text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/30"
            disabled={pending}
            onClick={() => setRetakeOpen(true)}
          >
            <RefreshCw className="mr-2 size-5" /> Re-take client
          </Button>
        </div>
      )}

      <RetakeDialog
        open={retakeOpen}
        members={rows.map((r) => ({ employeeId: r.employeeId, name: r.name }))}
        onClose={() => setRetakeOpen(false)}
      />

      <FinishDialog
        target={finishTarget}
        pending={pending}
        onSubmit={submitFinish}
        onClose={() => setFinishTarget(null)}
      />

      <Dialog
        open={returnPicker}
        onOpenChange={(o) => {
          if (!o && !pending) setReturnPicker(false);
        }}
      >
        <DialogContent className="max-w-md">
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
                disabled={busy(r.employeeId)}
                onClick={() =>
                  run(
                    storeStartReturn(r.employeeId),
                    `${r.name} takes the return.`,
                    r.employeeId,
                  )
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
