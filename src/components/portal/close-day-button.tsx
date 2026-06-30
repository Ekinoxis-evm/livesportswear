"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Moon } from "lucide-react";
import { closeDay } from "@/server/conversion";
import { Button } from "@/components/ui/button";

export function CloseDayButton({ alreadyClosed }: { alreadyClosed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      variant={alreadyClosed ? "outline" : "default"}
      className="w-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await closeDay();
          if (!res.ok) {
            toast.error(res.error ?? "Couldn't close the day.");
            return;
          }
          toast.success("Day closed — report sent.");
          router.refresh();
        })
      }
    >
      <Moon className="mr-1 size-4" />
      {pending
        ? "Closing…"
        : alreadyClosed
          ? "Re-send today's report"
          : "Close day & send report"}
    </Button>
  );
}
