"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateOwnColor } from "@/server/profile";
import { ColorSwatches } from "@/components/employee/color-swatches";

/**
 * Lets a rep set their own colour — the one shown on their kiosk avatar (when
 * they have no photo) and on their shifts across the schedules. Saves on tap.
 */
export function ColorPicker({ color }: { color: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(color);

  function pick(hex: string) {
    const prev = value;
    setValue(hex); // optimistic
    start(async () => {
      const res = await updateOwnColor(hex);
      if (!res.ok) {
        setValue(prev);
        toast.error(res.error);
        return;
      }
      toast.success("Colour updated.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-5 shrink-0 rounded-full border"
          style={{ backgroundColor: value ?? "transparent" }}
        />
        <span className="text-sm font-medium">Your colour</span>
      </div>
      <p className="text-muted-foreground text-xs">
        Shown on your avatar and your shifts on the schedule.
      </p>
      <div className={pending ? "opacity-60" : undefined}>
        <ColorSwatches value={value} onChange={pick} />
      </div>
    </div>
  );
}
