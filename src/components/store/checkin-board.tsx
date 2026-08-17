"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, LogOut, Lock, Coffee, Hand } from "lucide-react";
import {
  storeCheckIn,
  storeCheckOut,
  storeStartBreak,
  storeEndBreak,
} from "@/server/store-floor";
import { overBreakBudget } from "@/lib/breaks";
import { cn } from "@/lib/utils";
import { PinPad } from "@/components/store/pin-pad";
import { BreakTimer } from "@/components/store/break-timer";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type CheckinRow = {
  employeeId: string;
  name: string;
  avatarColor: string | null;
  avatarUrl: string | null;
  arrivedLabel: string;
  leftLabel: string | null;
  hours: number | null;
  breakMinutes: number;
  onBreak: boolean;
  breakStartedAt: string | null;
  breakPriorMinutes: number;
  attending: boolean; // with client(s) — can't start a break
};

export type RosterEntry = {
  id: string;
  name: string;
  avatarColor: string | null;
  avatarUrl: string | null;
};

type Flow = {
  kind: "in" | "out" | "break-start" | "break-end";
  id: string;
  name: string;
  pin: string | null; // null while the PIN step is open
};

const FLOW_TITLE: Record<Flow["kind"], string> = {
  in: "check in",
  out: "check out",
  "break-start": "start break",
  "break-end": "back from break",
};

export function CheckinBoard({
  checkins,
  offFloor,
}: {
  checkins: CheckinRow[];
  offFloor: RosterEntry[]; // active employees not currently on the floor
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [flow, setFlow] = useState<Flow | null>(null);

  const onFloor = checkins.filter((r) => !r.leftLabel);
  const onBreakCount = onFloor.filter((r) => r.onBreak).length;
  const outCount = checkins.length - onFloor.length;

  function submit(f: Flow) {
    start(async () => {
      const formData = new FormData();
      formData.set("employeeId", f.id);
      formData.set("pin", f.pin ?? "");
      const action = {
        in: storeCheckIn,
        out: storeCheckOut,
        "break-start": storeStartBreak,
        "break-end": storeEndBreak,
      }[f.kind];
      const res = await action(formData);
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        setFlow(null);
        return;
      }
      const done = {
        in: `${f.name} checked in.`,
        out: `${f.name} checked out.`,
        "break-start": `${f.name} is on break.`,
        "break-end": `${f.name} is back in the line.`,
      }[f.kind];
      toast.success(done);
      setFlow(null);
      router.refresh();
    });
  }

  // The PIN IS the attestation — a tap on the shop's own iPad plus a code only
  // that employee knows. The face photo that used to follow it was a second
  // step at the door for evidence nobody read, so it's gone.
  const submitPin = (pin: string) => {
    if (!flow) return;
    submit({ ...flow, pin });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* The floor at a glance */}
      {checkins.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="font-semibold tabular-nums">{onFloor.length}</span>{" "}
            <span className="text-muted-foreground">on the floor</span>
          </span>
          {onBreakCount > 0 && (
            <span className="text-sky-700 dark:text-sky-400">
              <span className="font-semibold tabular-nums">{onBreakCount}</span> on
              break
            </span>
          )}
          {outCount > 0 && (
            <span className="text-muted-foreground">
              <span className="font-semibold tabular-nums">{outCount}</span> checked
              out
            </span>
          )}
        </div>
      )}

      {/* Arrivals — big tiles: name → PIN → face photo */}
      {offFloor.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Check in
          </span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {offFloor.map((e) => (
              <Button
                key={e.id}
                variant="outline"
                disabled={pending}
                className="h-20 justify-start gap-3 text-base"
                onClick={() => setFlow({ kind: "in", id: e.id, name: e.name, pin: null })}
              >
                <EmployeeAvatar name={e.name} color={e.avatarColor} url={e.avatarUrl} className="size-10" />
                <span className="truncate font-semibold">{e.name}</span>
                <Lock className="text-muted-foreground ml-auto size-4" />
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Today's stamps */}
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Today
        </span>
        <Card>
          <CardContent className="pt-4">
            {checkins.length === 0 ? (
              <p className="text-muted-foreground py-4 text-sm">
                Nobody has checked in yet.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {checkins.map((r) => {
                  const out = Boolean(r.leftLabel);
                  return (
                    <li
                      key={r.employeeId}
                      className={cn(
                        "flex flex-wrap items-center gap-x-3 gap-y-2 py-3",
                        r.onBreak && "-mx-2 rounded-lg bg-sky-500/10 px-2",
                        out && "opacity-60",
                      )}
                    >
                      <EmployeeAvatar name={r.name} color={r.avatarColor} url={r.avatarUrl} className="size-10" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-center gap-2 truncate text-base font-semibold">
                          {r.name}
                          {r.onBreak && (
                            <span className="flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
                              <Coffee className="size-3" /> break
                            </span>
                          )}
                          {r.attending && (
                            <span className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                              <Hand className="size-3" /> with client
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          <LogIn className="mr-1 inline size-3" />
                          {r.arrivedLabel}
                          {r.leftLabel && (
                            <>
                              {" "}
                              <LogOut className="mr-1 ml-1.5 inline size-3" />
                              {r.leftLabel}
                            </>
                          )}
                          {r.hours != null && (
                            <span className="ml-1.5 font-medium">{r.hours}h</span>
                          )}
                          {r.breakMinutes > 0 && (
                            <span
                              className={
                                overBreakBudget(r.breakMinutes)
                                  ? "text-destructive ml-1.5 font-semibold"
                                  : "ml-1.5"
                              }
                            >
                              · {r.breakMinutes}m break
                            </span>
                          )}
                        </span>
                      </span>
                      {!out && (
                        <span className="flex items-center gap-2">
                          {r.onBreak ? (
                            <>
                              {r.breakStartedAt && (
                                <BreakTimer
                                  startedAt={r.breakStartedAt}
                                  priorMinutes={r.breakPriorMinutes}
                                />
                              )}
                              <Button
                                disabled={pending}
                                onClick={() =>
                                  setFlow({
                                    kind: "break-end",
                                    id: r.employeeId,
                                    name: r.name,
                                    pin: null,
                                  })
                                }
                              >
                                Back
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              disabled={pending || r.attending}
                              title={
                                r.attending
                                  ? "Finish their clients first"
                                  : undefined
                              }
                              onClick={() =>
                                setFlow({
                                  kind: "break-start",
                                  id: r.employeeId,
                                  name: r.name,
                                  pin: null,
                                })
                              }
                            >
                              <Coffee className="mr-1 size-4" /> Break
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            disabled={pending}
                            onClick={() =>
                              setFlow({
                                kind: "out",
                                id: r.employeeId,
                                name: r.name,
                                pin: null,
                              })
                            }
                          >
                            <LogOut className="mr-1 size-4" /> Check out
                          </Button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <PinPad
        open={flow !== null && flow.pin === null}
        title={flow ? `${flow.name} — ${FLOW_TITLE[flow.kind]}` : ""}
        subtitle="Enter your 4-digit PIN"
        pending={pending}
        onSubmit={submitPin}
        onClose={() => setFlow(null)}
      />
    </div>
  );
}
