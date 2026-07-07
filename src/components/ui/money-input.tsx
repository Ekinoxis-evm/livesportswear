"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat("en-US", { style: "currency", currency })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? "$"
    );
  } catch {
    return "$";
  }
}

function groupInt(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Numeric string (no separators) → grouped display, e.g. "1234.5" → "1,234.5". */
function toDisplay(raw: string, decimals: boolean): string {
  if (!raw) return "";
  const hasDot = raw.includes(".");
  const [int, frac = ""] = raw.split(".");
  const intClean = int.replace(/^0+(?=\d)/, "") || "0";
  let out = groupInt(intClean);
  if (decimals && hasDot) out += "." + frac.slice(0, 2);
  return out;
}

/** Typed text → clean numeric string the server can coerce (one dot, ≤2 decimals). */
function toRaw(text: string, decimals: boolean): string {
  let s = text.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!decimals) return s.replace(/\./g, "");
  const i = s.indexOf(".");
  if (i !== -1) {
    s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "").slice(0, 2);
  }
  return s;
}

type Props = {
  value: string;
  onValueChange: (raw: string) => void;
  currency?: string;
  decimals?: boolean;
} & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "inputMode"
>;

export function MoneyInput({
  value,
  onValueChange,
  currency = "USD",
  decimals = true,
  className,
  ...props
}: Props) {
  const [state, setState] = useState(() => ({
    raw: value ?? "",
    display: toDisplay(value ?? "", decimals),
  }));

  // Re-sync when the parent swaps the value from outside (e.g. the goal form
  // loading another store/month) — otherwise the box keeps showing the old
  // number while the submitted state has moved on.
  if (state.raw !== (value ?? "")) {
    setState({ raw: value ?? "", display: toDisplay(value ?? "", decimals) });
  }

  return (
    <div className="relative">
      <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
        {currencySymbol(currency)}
      </span>
      <Input
        {...props}
        inputMode="decimal"
        value={state.display}
        onChange={(e) => {
          const raw = toRaw(e.target.value, decimals);
          setState({ raw, display: toDisplay(raw, decimals) });
          onValueChange(raw);
        }}
        className={cn("pl-7 tabular-nums", className)}
      />
    </div>
  );
}
