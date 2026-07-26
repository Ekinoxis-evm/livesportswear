import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "count", label: "Count" },
  { key: "book", label: "Book" },
  { key: "push", label: "Push to Shopify" },
] as const;
type Step = (typeof STEPS)[number]["key"];

/**
 * The inventory process at a glance: Count → Book → Push. Shown on each step's
 * page so the three (previously disconnected) screens read as one flow. Done
 * steps link back; upcoming steps link forward when a location is known.
 */
export function InventoryFunnel({
  current,
  locationId,
}: {
  current: Step;
  locationId?: string;
}) {
  const idx = STEPS.findIndex((s) => s.key === current);
  const hrefFor = (k: Step): string | null => {
    if (k === "count") return "/admin/inventory";
    if (!locationId) return null;
    return k === "book"
      ? `/admin/inventory/book?location=${locationId}`
      : `/admin/inventory/push?location=${locationId}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {STEPS.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "current" : "todo";
        const href = hrefFor(s.key);
        const chip = (
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 font-medium",
              state === "current" && "border-primary bg-primary text-primary-foreground",
              state === "done" && "text-muted-foreground",
              state === "todo" && "text-muted-foreground/60",
            )}
          >
            {state === "done" ? (
              <Check className="size-3.5" />
            ) : (
              <span className="tabular-nums opacity-70">{i + 1}</span>
            )}
            {s.label}
          </span>
        );
        return (
          <span key={s.key} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground/40" aria-hidden>→</span>}
            {href && state !== "current" ? (
              <Link href={href} className="hover:opacity-80">
                {chip}
              </Link>
            ) : (
              chip
            )}
          </span>
        );
      })}
    </div>
  );
}
