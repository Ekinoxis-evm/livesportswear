"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, LogIn, LogOut, Hand, Lock } from "lucide-react";
import {
  storeOpenDay,
  storeCheckIn,
  storeCheckOut,
  storeTakeClient,
  storeSetAvailable,
  storeMakeUpNext,
  storeFinish,
  storeCloseDay,
} from "@/server/store-floor";
import { PinPad } from "@/components/store/pin-pad";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type KioskRow = {
  employeeId: string;
  name: string;
  avatarColor: string | null;
  state: "up" | "waiting" | "attending";
  turn: number | null;
  arrivedLabel: string;
};

export type RosterEntry = {
  id: string;
  name: string;
  avatarColor: string | null;
};

type PinTarget =
  | { kind: "in"; id: string; name: string }
  | { kind: "out"; id: string; name: string }
  | null;

export function KioskBoard({
  open,
  rows,
  offFloor,
  closers,
  totals,
  alreadyClosed,
}: {
  open: boolean;
  rows: KioskRow[];
  offFloor: RosterEntry[]; // active employees not on the floor
  closers: RosterEntry[]; // eligible to close (on shift + checked in)
  totals: { attended: number; sold: number; conversionPct: string };
  alreadyClosed: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pinTarget, setPinTarget] = useState<PinTarget>(null);
  const [finishFor, setFinishFor] = useState<string | null>(null); // employeeId in "got contact?" step

  const line = rows.filter((r) => r.state !== "attending");
  const attending = rows.filter((r) => r.state === "attending");
  const up = line[0] ?? null;

  function run(action: Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    start(async () => {
      const res = await action;
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      if (okMsg) toast.success(okMsg);
      setPinTarget(null);
      setFinishFor(null);
      router.refresh();
    });
  }

  const submitPin = (pin: string) => {
    if (!pinTarget) return;
    if (pinTarget.kind === "in") {
      run(storeCheckIn(pinTarget.id, pin), `${pinTarget.name} checked in.`);
    } else {
      run(storeCheckOut(pinTarget.id, pin), `${pinTarget.name} left the floor.`);
    }
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
            Nobody available in the line — check someone in below.
          </CardContent>
        </Card>
      )}

      {/* With a client now */}
      {attending.map((r) => (
        <div
          key={r.employeeId}
          className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-600">
              With a client
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              arrived {r.arrivedLabel}
            </span>
          </div>
          <p className="text-2xl font-bold">{r.name}</p>
          {finishFor === r.employeeId ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Got contact?</span>
              <Button
                size="lg"
                variant="outline"
                className="flex-1"
                disabled={pending}
                onClick={() =>
                  run(storeFinish(r.employeeId, { sold: true, got_contact: false }), "Logged: sold")
                }
              >
                No
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={pending}
                onClick={() =>
                  run(
                    storeFinish(r.employeeId, { sold: true, got_contact: true }),
                    "Logged: sold + contact",
                  )
                }
              >
                Yes
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button
                size="lg"
                variant="outline"
                className="border-destructive/40 text-destructive h-14 flex-1"
                disabled={pending}
                onClick={() =>
                  run(
                    storeFinish(r.employeeId, { sold: false, got_contact: false }),
                    "Logged: no sale",
                  )
                }
              >
                <X className="mr-1.5 size-5" /> No sale
              </Button>
              <Button
                size="lg"
                className="h-14 flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={pending}
                onClick={() => setFinishFor(r.employeeId)}
              >
                <Check className="mr-1.5 size-5" /> Sold
              </Button>
            </div>
          )}
        </div>
      ))}

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
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="sm" disabled={pending}>
                          Manage
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      {i > 0 && (
                        <DropdownMenuItem
                          onClick={() => run(storeMakeUpNext(r.employeeId), `${r.name} is up next.`)}
                        >
                          Make up next
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setPinTarget({ kind: "out", id: r.employeeId, name: r.name })}
                      >
                        <LogOut className="mr-1.5 size-4" /> Check out (PIN)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                  onClick={() => run(storeSetAvailable(r.employeeId), "")}
                >
                  Back to line
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Arrivals — big tiles, PIN to check in */}
      {offFloor.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Not on the floor — tap to check in
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {offFloor.map((e) => (
              <Button
                key={e.id}
                variant="outline"
                disabled={pending}
                className="h-16 justify-start gap-2.5 text-base"
                onClick={() => setPinTarget({ kind: "in", id: e.id, name: e.name })}
              >
                {tile(e.avatarColor)}
                <span className="truncate">{e.name}</span>
                <Lock className="text-muted-foreground ml-auto size-4" />
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Day strip + close */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex gap-6 text-sm">
            <span>
              <span className="text-2xl font-bold tabular-nums">{totals.attended}</span>{" "}
              <span className="text-muted-foreground">attended</span>
            </span>
            <span>
              <span className="text-2xl font-bold tabular-nums">{totals.sold}</span>{" "}
              <span className="text-muted-foreground">sold</span>
            </span>
            <span>
              <span className="text-2xl font-bold tabular-nums">{totals.conversionPct}</span>{" "}
              <span className="text-muted-foreground">conversion</span>
            </span>
          </div>
          {alreadyClosed ? (
            <span className="text-muted-foreground text-sm">Day closed ✓</span>
          ) : closers.length === 0 ? (
            <span className="text-muted-foreground text-sm">
              Close needs someone on shift &amp; checked in
            </span>
          ) : (
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
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => run(storeCloseDay(c.id), "Day closed — report sent.")}
                  >
                    Close as {c.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardContent>
      </Card>

      <PinPad
        open={pinTarget !== null}
        title={
          pinTarget?.kind === "out"
            ? `${pinTarget.name} — check out`
            : `${pinTarget?.name ?? ""} — check in`
        }
        subtitle="Enter your 4-digit PIN"
        pending={pending}
        onSubmit={submitPin}
        onClose={() => setPinTarget(null)}
      />
    </div>
  );
}
