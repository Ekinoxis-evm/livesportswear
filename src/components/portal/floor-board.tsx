"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Hand, LogIn, LogOut, UserPlus, Clock } from "lucide-react";
import {
  openDay,
  checkIn,
  markAttending,
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

export function FloorBoard({
  meId,
  isLead,
  open,
  rows,
  roster,
}: {
  meId: string;
  isLead: boolean;
  open: boolean;
  rows: BoardRow[];
  roster: { id: string; name: string }[]; // not currently on the floor
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [askContact, setAskContact] = useState(false);

  const meRow = rows.find((r) => r.employeeId === meId);

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
        <ul className="bg-card flex flex-col divide-y rounded-xl border">
          {rows.map((r) => {
            const isMe = r.employeeId === meId;
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
                  {isMe && r.state !== "attending" && (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => run(markAttending(meId), "")}
                    >
                      Take client
                    </Button>
                  )}
                  {isMe && r.state === "attending" && !askContact && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/40 text-destructive"
                        disabled={pending}
                        onClick={() =>
                          run(finishCustomer(meId, { sold: false, got_contact: false }), "Logged: no sale")
                        }
                      >
                        <X className="mr-1 size-4" /> No sale
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={pending}
                        onClick={() => setAskContact(true)}
                      >
                        <Check className="mr-1 size-4" /> Sold
                      </Button>
                    </div>
                  )}
                  {isMe && r.state === "attending" && askContact && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-xs">Got contact?</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(finishCustomer(meId, { sold: true, got_contact: false }), "Logged: sold")
                        }
                      >
                        No
                      </Button>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(finishCustomer(meId, { sold: true, got_contact: true }), "Logged: sold + contact")
                        }
                      >
                        Yes
                      </Button>
                    </div>
                  )}
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
                  {!isMe && isLead && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button size="icon-sm" variant="ghost" aria-label="Manage" disabled={pending}>
                            <X className="size-4 rotate-45" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        {r.state === "attending" && (
                          <DropdownMenuItem onClick={() => run(setAvailable(r.employeeId), "")}>
                            Back to line
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => run(checkOut(r.employeeId), `${r.name} left.`)}>
                          Check out
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
