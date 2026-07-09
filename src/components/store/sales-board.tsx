"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, Hand, Undo2 } from "lucide-react";
import {
  storeOpenDay,
  storeTakeClient,
  storeStartReturn,
  storeSetAvailable,
  storeMakeUpNext,
  storeFinish,
  type FinishInput,
} from "@/server/store-floor";
import {
  FinishDialog,
  type FinishTarget,
} from "@/components/store/finish-dialog";
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
  state: "up" | "waiting" | "attending";
  turn: number | null;
  arrivedLabel: string;
};

export function SalesBoard({ open, rows }: { open: boolean; rows: SalesRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [finishTarget, setFinishTarget] = useState<FinishTarget | null>(null);
  const [returnPicker, setReturnPicker] = useState(false);
  // Which attending employees are on a return (client-side until PR 5 persists it).
  const [returnFor, setReturnFor] = useState<Set<string>>(new Set());

  const line = rows.filter((r) => r.state !== "attending");
  const attending = rows.filter((r) => r.state === "attending");
  const up = line[0] ?? null;
  // A return shouldn't burn the up-next's turn — the LAST in line is suggested.
  const returnSuggestion = line[line.length - 1] ?? null;

  function run(action: Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    start(async () => {
      const res = await action;
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      if (okMsg) toast.success(okMsg);
      setFinishTarget(null);
      setReturnPicker(false);
      router.refresh();
    });
  }

  const startReturn = (r: SalesRow) => {
    setReturnFor((cur) => new Set(cur).add(r.employeeId));
    run(storeStartReturn(r.employeeId), `${r.name} takes the return.`);
  };

  const submitFinish = (employeeId: string, input: FinishInput) => {
    setReturnFor((cur) => {
      const next = new Set(cur);
      next.delete(employeeId);
      return next;
    });
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

      {/* With a client now */}
      {attending.map((r) => {
        const isReturn = returnFor.has(r.employeeId);
        return (
          <div
            key={r.employeeId}
            className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                {isReturn ? "With a return / exchange" : "With a client"}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                arrived {r.arrivedLabel}
              </span>
            </div>
            <p className="text-2xl font-bold">{r.name}</p>
            <Button
              size="lg"
              className="h-14"
              disabled={pending}
              onClick={() =>
                setFinishTarget({
                  employeeId: r.employeeId,
                  name: r.name,
                  kind: isReturn ? "return" : "walkin",
                })
              }
            >
              Finish
            </Button>
          </div>
        );
      })}

      {/* The line */}
      {line.length > 0 && (
        <Card>
          <CardContent className="flex flex-col divide-y pt-2">
            {line.map((r, i) => (
              <div key={r.employeeId} className="flex items-center justify-between gap-2 py-3">
                <span className="flex items-center gap-2.5 text-base font-medium">
                  <span className="text-muted-foreground w-6 text-center tabular-nums">
                    {i + 1}
                  </span>
                  {tile(r.avatarColor)}
                  {r.name}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground mr-1 text-xs tabular-nums">
                    since {r.arrivedLabel}
                  </span>
                  {i > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(storeMakeUpNext(r.employeeId), `${r.name} is up next.`)}
                    >
                      Make up next
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {attending.map((r) => (
              <div key={r.employeeId} className="flex items-center justify-between gap-2 py-3">
                <span className="flex items-center gap-2.5 text-base font-medium opacity-70">
                  <span className="w-6 text-center text-amber-600">●</span>
                  {tile(r.avatarColor)}
                  {r.name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setReturnFor((cur) => {
                      const next = new Set(cur);
                      next.delete(r.employeeId);
                      return next;
                    });
                    run(storeSetAvailable(r.employeeId), "");
                  }}
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
                onClick={() => startReturn(r)}
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
