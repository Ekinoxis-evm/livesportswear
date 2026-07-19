"use client";

import { Check } from "lucide-react";
import { AVATAR_COLORS } from "@/lib/avatar-palette";
import { cn } from "@/lib/utils";

/**
 * Tap-a-swatch color picker for employee colors. A legacy off-palette value
 * (from the old free-text field) is shown as an extra swatch so editing an
 * existing employee never silently drops their color.
 */
export function ColorSwatches({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (hex: string) => void;
}) {
  const palette: string[] = [...AVATAR_COLORS];
  if (value && !palette.includes(value)) palette.push(value);
  return (
    <div role="radiogroup" aria-label="Employee color" className="flex flex-wrap gap-2">
      {palette.map((hex) => {
        const selected = value === hex;
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Color ${hex}`}
            onClick={() => onChange(hex)}
            className={cn(
              "flex size-9 items-center justify-center rounded-full border-2 transition-transform",
              selected
                ? "border-foreground scale-110"
                : "border-transparent hover:scale-105",
            )}
            style={{ backgroundColor: hex }}
          >
            {selected && <Check className="size-4 text-white" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
