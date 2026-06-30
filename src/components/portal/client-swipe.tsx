"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Undo2, UserPlus } from "lucide-react";
import { markClient, undoLastClient } from "@/server/conversion";
import { Button } from "@/components/ui/button";

export function ClientSwipe() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false); // sold -> confirm contact

  function run(action: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(ok);
      setAsking(false);
      router.refresh();
    });
  }

  const mark = (sold: boolean, got_contact: boolean, ok: string) =>
    run(() => markClient({ sold, got_contact }), ok);

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-card flex flex-col items-center gap-2 rounded-2xl border p-8 text-center">
        <UserPlus className="text-muted-foreground size-8" />
        <p className="text-lg font-semibold">Next client</p>
        <p className="text-muted-foreground text-sm">
          {asking ? "Did you get their contact?" : "Did they buy?"}
        </p>
      </div>

      {asking ? (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            variant="outline"
            className="h-16 text-base"
            disabled={pending}
            onClick={() => mark(true, false, "Logged: sold")}
          >
            No contact
          </Button>
          <Button
            size="lg"
            className="h-16 text-base"
            disabled={pending}
            onClick={() => mark(true, true, "Logged: sold + contact")}
          >
            <UserPlus className="mr-1 size-5" /> Got contact
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 h-20 text-base"
            disabled={pending}
            onClick={() => mark(false, false, "Logged: no sale")}
          >
            <X className="mr-1 size-6" /> No sale
          </Button>
          <Button
            size="lg"
            className="h-20 bg-emerald-600 text-base text-white hover:bg-emerald-700"
            disabled={pending}
            onClick={() => setAsking(true)}
          >
            <Check className="mr-1 size-6" /> Sold
          </Button>
        </div>
      )}

      <div className="flex justify-center">
        {asking ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setAsking(false)}
          >
            Back
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => run(undoLastClient, "Last client removed")}
          >
            <Undo2 className="mr-1 size-4" /> Undo last
          </Button>
        )}
      </div>
    </div>
  );
}
