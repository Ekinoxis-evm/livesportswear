"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  X,
  Hand,
  LogIn,
  LogOut,
  UserPlus,
  Clock,
  MoreHorizontal,
  History,
} from "lucide-react";
import {
  openDay,
  checkIn,
  markAttending,
  makeUpNext,
  setAvailable,
  checkOut,
  finishCustomer,
} from "@/server/floor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type BoardRow = {
  employeeId: string;
  name: string;
  state: "up" | "waiting" | "attending";
  turn: number | null;
  arrivedLabel: string;
};

const MAX_BAR_TURNS = 4;

export function FloorBoard({
  meId,
  isLead,
  open,
  rows,
  roster,
  lastAttendedName,
}: {
  meId: string;
  isLead: boolean;
  open: boolean;
  rows: BoardRow[];
  roster: { id: string; name: string }[]; // not currently on the floor
  lastAttendedName: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [askContact, setAskContact] = useState(false);

  const meRow = rows.find((r) => r.employeeId === meId);
  const line = rows.filter((r) => r.state !== "attending"); // ordered; [0] is up
  const attending = rows.filter((r) => r.state === "attending");
  const upRow = line[0] ?? null;
  const thenRow = line[1] ?? null;

  function run(action: Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const res = await action;
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      if (ok) toast.success(ok);
      setAskContact(false);
      router.refresh();
    });
  }

  // ---- day not open ----
  if (!open) {
    return (
      <div className="bg-card flex flex-col items-center gap-3 rounded-2xl border p-8 text-center">
        <Clock className="text-muted-foreground size-7" />
        <p className="font-semibold">The day isn&apos;t open yet</p>
        {isLead ? (
          <Button disabled={pending} onClick={() => run(openDay(), "Day opened.")}>
            <LogIn className="mr-1 size-4" /> Open day
          </Button>
        ) : (
          <p className="text-muted-foreground text-sm">
            Your shift lead will open the day to start the queue.
          </p>
        )}
      </div>
    );
  }

  const stateBadge = (r: BoardRow) =>
    r.state === "up" ? (
      <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase">
        Up next
      </span>
    ) : r.state === "attending" ? (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600">
        With a client
      </span>
    ) : (
      <span className="text-muted-foreground text-xs tabular-nums">#{r.turn}</span>
    );

  const finishButtons = (big: boolean) =>
    !askContact ? (
      <div className={cn("flex gap-2", big && "w-full")}>
        <Button
          size={big ? "default" : "sm"}
          variant="outline"
          className={cn("border-destructive/40 text-destructive", big && "flex-1")}
          disabled={pending}
          onClick={() =>
            run(finishCustomer(meId, { sold: false, got_contact: false }), "Logged: no sale")
          }
        >
          <X className="mr-1 size-4" /> No sale
        </Button>
        <Button
          size={big ? "default" : "sm"}
          className={cn("bg-emerald-600 text-white hover:bg-emerald-700", big && "flex-1")}
          disabled={pending}
          onClick={() => setAskContact(true)}
        >
          <Check className="mr-1 size-4" /> Sold
        </Button>
      </div>
    ) : (
      <div className={cn("flex items-center gap-2", big && "w-full")}>
        <span className="text-muted-foreground text-sm">Got contact?</span>
        <Button
          size={big ? "default" : "sm"}
          variant="outline"
          className={cn(big && "flex-1")}
          disabled={pending}
          onClick={() =>
            run(finishCustomer(meId, { sold: true, got_contact: false }), "Logged: sold")
          }
        >
          No
        </Button>
        <Button
          size={big ? "default" : "sm"}
          className={cn(big && "flex-1")}
          disabled={pending}
          onClick={() =>
            run(finishCustomer(meId, { sold: true, got_contact: true }), "Logged: sold + contact")
          }
        >
          Yes
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {/* arrivals */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Floor queue</h2>
        <div className="flex gap-2">
          {!meRow && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(checkIn(meId), "Checked in.")}
            >
              <Hand className="mr-1 size-4" /> I&apos;ve arrived
            </Button>
          )}
          {isLead && roster.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="outline" disabled={pending}>
                    <UserPlus className="mr-1 size-4" /> Add arrival
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                {roster.map((e) => (
                  <DropdownMenuItem
                    key={e.id}
                    onClick={() => run(checkIn(e.id), `${e.name} checked in.`)}
                  >
                    {e.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-xl border p-6 text-center text-sm">
          Nobody on the floor yet. Add who arrived first.
        </p>
      ) : (
        <>
          {/* turn bar: the line in order, current turn highlighted */}
          <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
            {line.slice(0, MAX_BAR_TURNS).map((r, i) => {
              const isMe = r.employeeId === meId;
              return (
                <div
                  key={r.employeeId}
                  className={cn(
                    "flex min-w-0 flex-1 basis-0 flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-center",
                    i === 0
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground opacity-70",
                    isMe && "ring-primary/60 ring-2",
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase tabular-nums">
                    {i === 0 ? "Turn" : `#${i + 1}`}
                  </span>
                  <span className="w-full truncate text-xs font-medium">
                    {r.name}
                    {isMe ? " (you)" : ""}
                  </span>
                </div>
              );
            })}
            {line.length > MAX_BAR_TURNS && (
              <div className="bg-card text-muted-foreground flex items-center rounded-lg border px-2 text-xs tabular-nums opacity-70">
                +{line.length - MAX_BAR_TURNS}
              </div>
            )}
            {attending.map((r) => (
              <div
                key={r.employeeId}
                className="flex min-w-0 flex-col items-center gap-0.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-center text-amber-600"
              >
                <span className="text-[10px] font-semibold uppercase">Client</span>
                <span className="w-full truncate text-xs font-medium">
                  {r.name}
                  {r.employeeId === meId ? " (you)" : ""}
                </span>
              </div>
            ))}
          </div>

          {/* with a client now — big */}
          {attending.map((r) => {
            const isMe = r.employeeId === meId;
            return (
              <div
                key={r.employeeId}
                className="flex flex-col gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                    With a client now
                  </span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    arrived {r.arrivedLabel}
                  </span>
                </div>
                <p className="text-2xl font-bold">
                  {r.name}
                  {isMe ? " (you)" : ""}
                </p>
                {isMe && finishButtons(true)}
              </div>
            );
          })}

          {/* up next — big, active only for the person whose turn it is */}
          {upRow && (
            <div className="border-primary bg-primary/5 flex flex-col gap-3 rounded-2xl border p-5">
              <span className="text-primary text-[10px] font-semibold uppercase tracking-wide">
                Up next
              </span>
              <p className="text-2xl font-bold">
                {upRow.name}
                {upRow.employeeId === meId ? " (you)" : ""}
              </p>
              {upRow.employeeId === meId ? (
                <Button
                  size="lg"
                  className="w-full"
                  disabled={pending}
                  onClick={() => run(markAttending(meId), "")}
                >
                  Take client
                </Button>
              ) : (
                meRow &&
                meRow.state === "waiting" && (
                  <p className="text-muted-foreground text-sm tabular-nums">
                    You&apos;re #{meRow.turn} in line.
                  </p>
                )
              )}
            </div>
          )}

          {/* then — preview, not active yet */}
          {thenRow && (
            <div className="bg-card flex items-center justify-between gap-2 rounded-xl border p-4 opacity-60">
              <div className="flex flex-col">
                <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
                  Then
                </span>
                <span className="font-medium">
                  {thenRow.name}
                  {thenRow.employeeId === meId ? " (you)" : ""}
                </span>
              </div>
              <span className="text-muted-foreground text-xs tabular-nums">#2</span>
            </div>
          )}

          {lastAttendedName && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <History className="size-3.5" /> Last to attend: {lastAttendedName}
            </p>
          )}

          {/* full roster */}
          <ul className="bg-card flex flex-col divide-y rounded-xl border">
            {rows.map((r) => {
              const isMe = r.employeeId === meId;
              const canBump = isLead && r.state === "waiting";
              const canManage = isLead && (canBump || (!isMe && r.state !== "waiting"));
              return (
                <li
                  key={r.employeeId}
                  className={cn(
                    "flex items-center justify-between gap-2 p-3",
                    r.state === "up" && "bg-primary/5",
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {r.name}
                      {isMe ? " (you)" : ""}
                    </span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      arrived {r.arrivedLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {stateBadge(r)}
                    {isMe && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Leave floor"
                        disabled={pending}
                        onClick={() => run(checkOut(meId), "You left the floor.")}
                      >
                        <LogOut className="size-4" />
                      </Button>
                    )}
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Manage"
                              disabled={pending}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          {canBump && (
                            <DropdownMenuItem
                              onClick={() =>
                                run(makeUpNext(r.employeeId), `${r.name} is up next.`)
                              }
                            >
                              Make up next
                            </DropdownMenuItem>
                          )}
                          {!isMe && r.state === "attending" && (
                            <DropdownMenuItem
                              onClick={() => run(setAvailable(r.employeeId), "")}
                            >
                              Back to line
                            </DropdownMenuItem>
                          )}
                          {!isMe && (
                            <DropdownMenuItem
                              onClick={() => run(checkOut(r.employeeId), `${r.name} left.`)}
                            >
                              Check out
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
