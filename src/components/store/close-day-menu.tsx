"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { storeCloseDay } from "@/server/store-floor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type CloserEntry = { id: string; name: string };

export function CloseDayMenu({
  closers,
  alreadyClosed,
}: {
  closers: CloserEntry[]; // on today's published schedule + checked in
  alreadyClosed: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (alreadyClosed) {
    return <span className="text-muted-foreground text-sm">Day closed ✓</span>;
  }
  if (closers.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">
        Close needs someone on shift &amp; checked in
      </span>
    );
  }

  return (
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
            onClick={() =>
              start(async () => {
                const res = await storeCloseDay(c.id);
                if (!res.ok) {
                  toast.error(res.error ?? "Something went wrong.");
                  return;
                }
                toast.success("Day closed — report sent.");
                router.refresh();
              })
            }
          >
            Close as {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
