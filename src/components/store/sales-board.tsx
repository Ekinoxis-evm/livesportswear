"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, LogIn, Hand } from "lucide-react";
import {
  storeOpenDay,
  storeTakeClient,
  storeSetAvailable,
  storeMakeUpNext,
  storeFinish,
} from "@/server/store-floor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
      setFinishFor(null);
      router.refresh();
    });
  }

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
                  onClick={() => run(storeSetAvailable(r.employeeId), "")}
                >
                  Back to line
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
