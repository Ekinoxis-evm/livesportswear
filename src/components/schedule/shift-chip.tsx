import { Crown } from "lucide-react";
import { shiftTint } from "@/lib/shift-color";
import { cn } from "@/lib/utils";

/**
 * One shift on a schedule, tinted by the employee's own colour. Shared by the
 * kiosk week, the public week, and the admin board so a person's shifts look
 * the same everywhere. Colour is never the only signal — the name and time
 * carry the shift regardless (a11y rule). An `off` shift drops the tint for the
 * destructive style instead.
 */
export function ShiftChip({
  name,
  color,
  isManager = false,
  timeLabel,
  off = false,
  trailing,
  className,
}: {
  name: string;
  color: string | null | undefined;
  isManager?: boolean;
  timeLabel?: string;
  off?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const tint = shiftTint(color);
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
        off && "border-destructive/40 bg-destructive/15 text-destructive",
        className,
      )}
      style={
        off
          ? undefined
          : { backgroundColor: tint.backgroundColor, borderColor: tint.borderColor }
      }
    >
      {isManager && <Crown className="size-3 shrink-0 text-amber-500" />}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {timeLabel && (
        <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
          {timeLabel}
        </span>
      )}
      {trailing}
    </span>
  );
}
