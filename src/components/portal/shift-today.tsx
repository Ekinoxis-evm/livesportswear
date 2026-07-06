"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  Flag,
  LogIn,
  LogOut,
  ScanLine,
} from "lucide-react";
import { checkIn, checkOut } from "@/server/floor";
import { Button } from "@/components/ui/button";
import { ValidationQr } from "@/components/portal/validation-qr";

export type ShiftTodayInfo = {
  label: string; // "Morning" | "Evening" | template name | "Shift"
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

export type StampView = {
  timeLabel: string; // HH:MM the tap was recorded
  status: "validated" | "self" | "pending";
  validatorName: string | null;
  token: string | null; // pending → QR token
};

export type CheckinView = {
  entry: StampView;
  exit: StampView | null; // null while still on the floor
  workedLabel: string | null; // "8.0h" once exited
};

function StampLine({ kind, stamp }: { kind: "Entry" | "Exit"; stamp: StampView }) {
  if (stamp.status === "pending") {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-medium text-amber-600">
          {kind} at {stamp.timeLabel} — waiting for a coworker to validate
        </p>
        {stamp.token && (
          <ValidationQr
            token={stamp.token}
            caption={`Ask a coworker to scan this to confirm your ${kind.toLowerCase()}`}
          />
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
        {stamp.status === "self" ? (
          <Flag className="size-4" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}
        {kind} at {stamp.timeLabel}
        {stamp.status === "self"
          ? kind === "Entry"
            ? " · first in"
            : " · last out"
          : stamp.validatorName
            ? ` · validated by ${stamp.validatorName}`
            : " · validated"}
      </p>
      {stamp.status === "self" && (
        <p className="text-muted-foreground text-xs">
          Nobody was here to validate — recorded and flagged for the admin.
        </p>
      )}
    </div>
  );
}

export function ShiftToday({
  meId,
  shift,
  checkin,
}: {
  meId: string;
  shift: ShiftTodayInfo | null;
  checkin: CheckinView | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(action: Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const res = await action;
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(ok);
      router.refresh();
    });
  }

  if (!shift && !checkin) {
    return (
      <div className="bg-card text-muted-foreground flex items-center gap-2.5 rounded-xl border p-4 text-sm">
        <CalendarX className="size-4 shrink-0" />
        You don&apos;t have a shift today.
      </div>
    );
  }

  const done = Boolean(checkin?.exit);

  return (
    <div className="border-primary bg-primary/5 flex flex-col gap-3 rounded-2xl border p-5">
      <span className="text-primary flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
        <CalendarCheck className="size-3.5" />
        {shift ? "Your shift today" : "On the floor today"}
      </span>
      {shift && (
        <p className="text-2xl font-bold">
          {shift.label}
          <span className="text-muted-foreground ml-2 text-base font-medium tabular-nums">
            {shift.start} – {shift.end}
          </span>
        </p>
      )}

      {!checkin ? (
        <Button
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={() => run(checkIn(meId), "Entry marked. You're on the floor.")}
        >
          <LogIn className="mr-1.5 size-4" /> Mark entry
        </Button>
      ) : (
        <>
          <StampLine kind="Entry" stamp={checkin.entry} />
          {checkin.exit ? (
            <StampLine kind="Exit" stamp={checkin.exit} />
          ) : (
            checkin.entry.status !== "pending" && (
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                disabled={pending}
                onClick={() => run(checkOut(meId), "Exit marked.")}
              >
                <LogOut className="mr-1.5 size-4" /> Mark exit
              </Button>
            )
          )}
          {done && checkin.workedLabel && (
            <p className="text-muted-foreground text-sm font-medium tabular-nums">
              Shift complete · {checkin.workedLabel} worked
            </p>
          )}
          <Link
            href="/portal/scan"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
          >
            <ScanLine className="size-4" /> Scan a coworker&apos;s QR to validate them
          </Link>
        </>
      )}
    </div>
  );
}
