"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, LogOut, Lock } from "lucide-react";
import { storeCheckIn, storeCheckOut } from "@/server/store-floor";
import { PinPad } from "@/components/store/pin-pad";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type CheckinRow = {
  employeeId: string;
  name: string;
  avatarColor: string | null;
  arrivedLabel: string;
  leftLabel: string | null;
  hours: number | null;
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

export function CheckinBoard({
  checkins,
  offFloor,
}: {
  checkins: CheckinRow[];
  offFloor: RosterEntry[]; // active employees who never checked in or already left
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pinTarget, setPinTarget] = useState<PinTarget>(null);

  function run(action: Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    start(async () => {
      const res = await action;
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      if (okMsg) toast.success(okMsg);
      setPinTarget(null);
      router.refresh();
    });
  }

  const submitPin = (pin: string) => {
    if (!pinTarget) return;
    if (pinTarget.kind === "in") {
      run(storeCheckIn(pinTarget.id, pin), `${pinTarget.name} checked in.`);
    } else {
      run(storeCheckOut(pinTarget.id, pin), `${pinTarget.name} checked out.`);
    }
  };

  const tile = (color: string | null) => (
    <span
      aria-hidden
      className="size-3 shrink-0 rounded-full border"
      style={{ backgroundColor: color ?? "transparent" }}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Arrivals — big tiles, PIN to check in */}
      {offFloor.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
            Check in
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

      {/* Today's stamps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today</CardTitle>
        </CardHeader>
        <CardContent>
          {checkins.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nobody has checked in yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {checkins.map((r) => (
                <li
                  key={r.employeeId}
                  className="flex items-center justify-between gap-2 py-3"
                >
                  <span className="flex items-center gap-2.5 text-base font-medium">
                    {tile(r.avatarColor)}
                    {r.name}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm tabular-nums">
                      <LogIn className="mr-1 inline size-3.5" />
                      {r.arrivedLabel}
                      {r.leftLabel && (
                        <>
                          {" "}
                          <LogOut className="mr-1 ml-2 inline size-3.5" />
                          {r.leftLabel}
                        </>
                      )}
                      {r.hours != null && (
                        <span className="ml-2 font-medium">{r.hours}h</span>
                      )}
                    </span>
                    {!r.leftLabel && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          setPinTarget({ kind: "out", id: r.employeeId, name: r.name })
                        }
                      >
                        <LogOut className="mr-1 size-4" /> Check out
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
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
