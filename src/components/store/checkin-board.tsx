"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, LogOut, Lock } from "lucide-react";
import { storeCheckIn, storeCheckOut } from "@/server/store-floor";
import { overBreakBudget } from "@/lib/breaks";
import { PinPad } from "@/components/store/pin-pad";
import { CameraCapture } from "@/components/store/camera-capture";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type CheckinRow = {
  employeeId: string;
  name: string;
  avatarColor: string | null;
  arrivedLabel: string;
  leftLabel: string | null;
  hours: number | null;
  breakMinutes: number;
  entryPhotoUrl: string | null;
  exitPhotoUrl: string | null;
};

export type RosterEntry = {
  id: string;
  name: string;
  avatarColor: string | null;
};

type Flow = {
  kind: "in" | "out";
  id: string;
  name: string;
  pin: string | null; // null while the PIN step is open
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

  function submit(f: Flow, photo: Blob | null) {
    start(async () => {
      const formData = new FormData();
      formData.set("employeeId", f.id);
      formData.set("pin", f.pin ?? "");
      if (photo) {
        formData.set("photo", new File([photo], "face.jpg", { type: "image/jpeg" }));
      }
      const res = f.kind === "in" ? await storeCheckIn(formData) : await storeCheckOut(formData);
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        setFlow(null);
        return;
      }
      toast.success(f.kind === "in" ? `${f.name} checked in.` : `${f.name} checked out.`);
      setFlow(null);
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

  const photoThumb = (url: string | null, alt: string) =>
    url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt} className="size-9 rounded-md object-cover" />
    ) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Arrivals — big tiles: name → PIN → face photo */}
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
                onClick={() => setFlow({ kind: "in", id: e.id, name: e.name, pin: null })}
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
                    <span className="flex gap-1">
                      {photoThumb(r.entryPhotoUrl, `${r.name} check-in`)}
                      {photoThumb(r.exitPhotoUrl, `${r.name} check-out`)}
                    </span>
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
                      {r.breakMinutes > 0 && (
                        <span
                          className={
                            overBreakBudget(r.breakMinutes)
                              ? "text-destructive ml-2 font-semibold"
                              : "ml-2"
                          }
                        >
                          · {r.breakMinutes}m break
                        </span>
                      )}
                    </span>
                    {!r.leftLabel && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          setFlow({ kind: "out", id: r.employeeId, name: r.name, pin: null })
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
        open={flow !== null && flow.pin === null}
        title={
          flow?.kind === "out" ? `${flow.name} — check out` : `${flow?.name ?? ""} — check in`
        }
        subtitle="Enter your 4-digit PIN"
        pending={pending}
        onSubmit={(pin) => setFlow((f) => (f ? { ...f, pin } : f))}
        onClose={() => setFlow(null)}
      />

      <Dialog
        open={flow !== null && flow.pin !== null}
        onOpenChange={(o) => {
          if (!o && !pending) setFlow(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">Face photo</DialogTitle>
          {flow && flow.pin !== null && (
            <CameraCapture
              title={`${flow.name} — look at the camera`}
              pending={pending}
              onCapture={(photo) => submit(flow, photo)}
              onCancel={() => setFlow(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
