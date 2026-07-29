"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GoalMeterModel } from "@/lib/goal-meter";

/**
 * One goal meter, replacing the old goal bar + fill-card + levels bar. A single
 * progress bar 0 → top level: the fill turns green once the goal is reached, a
 * tick marks each level (with its rate), and the "how much more · per day → next
 * level" detail lives behind a tap (kiosk, no cursor) or hover (desktop) — so
 * the always-on view stays clean. Model is pure (`buildGoalMeter`); this only
 * renders + toggles the detail. Renders nothing when there's no goal/levels.
 */
export function GoalMeter({
  model,
  format,
  title,
  compact = false,
  className,
}: {
  model: GoalMeterModel | null;
  format: (n: number) => string;
  title?: string;
  /** Slim bar + % only (for dense admin rows). */
  compact?: boolean;
  className?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  if (!model) return null;

  const open = pinned || hovered;
  const pctLabel = Math.round(Math.min(Math.max(model.pct, 0), 1) * 100);
  const rate = (r: number) => `${(r * 100).toFixed((r * 100) % 1 === 0 ? 0 : 1)}%`;
  // A per-rep tier's label IS its rate; don't print the rate twice.
  const rateSuffix = (label: string, r: number | null) =>
    r != null && label !== rate(r) ? ` (${rate(r)})` : "";
  const reached = model.reachedGoal;

  return (
    <div className={cn("relative flex flex-col", compact ? "gap-1" : "gap-2", className)}>
      {!compact && (
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            {title && (
              <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                {title}
              </span>
            )}
            <span className="text-2xl font-bold tabular-nums leading-tight">
              {format(model.current)}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span
              className={cn(
                "text-3xl font-bold tabular-nums leading-none",
                reached ? "text-emerald-600 dark:text-emerald-400" : "text-primary",
              )}
            >
              {pctLabel}%
            </span>
            <span className="text-muted-foreground text-[11px]">
              {reached
                ? "goal reached 🎉"
                : model.next
                  ? `to ${model.next.label}`
                  : "of goal"}
            </span>
          </div>
        </div>
      )}

      {/* The bar is the tap/hover target — the whole thing, for a big touch area. */}
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${pctLabel}% of goal — details`}
        onClick={() => setPinned((p) => !p)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onBlur={() => setPinned(false)}
        className="group block w-full cursor-pointer text-left"
      >
        <div
          className={cn(
            "bg-muted relative w-full overflow-hidden rounded-full ring-offset-1 transition group-hover:ring-1 group-active:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-ring",
            reached ? "group-hover:ring-emerald-500/40" : "group-hover:ring-primary/40",
            compact ? "h-2.5" : "h-3.5",
          )}
          role="progressbar"
          aria-valuenow={pctLabel}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 transition-[width]",
              reached ? "bg-emerald-500" : "bg-primary",
            )}
            style={{ width: `${model.fillPct}%` }}
          />
          {/* level ticks */}
          {model.ticks.slice(0, -1).map((t) => (
            <span
              key={t.value}
              aria-hidden
              className="bg-background/70 absolute inset-y-0 w-0.5"
              style={{ left: `${t.leftPct}%` }}
            />
          ))}
          {/* the set goal, when it doesn't land on a level */}
          {model.goal?.separate && (
            <span
              aria-hidden
              className="absolute inset-y-0 w-0.5 bg-amber-500"
              style={{ left: `${model.goal.leftPct}%` }}
            />
          )}
        </div>

      </button>

      {/* Detail: what's left + per day to the next target, plus the level list. */}
      {open && (model.next || model.ticks.length > 0) && (
        <div className="bg-popover text-popover-foreground absolute top-full z-10 mt-1 w-full max-w-sm rounded-lg border p-3 shadow-md">
          {model.next ? (
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{format(model.next.remaining)}</span> more
              {model.next.perDay != null && (
                <>
                  {" · "}
                  <span className="font-semibold tabular-nums">{format(model.next.perDay)}</span>
                  <span className="text-muted-foreground">
                    /{model.workBasis ? "work day" : "day"}
                  </span>
                </>
              )}{" "}
              <span className="text-muted-foreground">
                → {model.next.label}
                {rateSuffix(model.next.label, model.next.rate)}
              </span>
            </p>
          ) : (
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Top level reached — nice.
            </p>
          )}
          {model.ticks.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {model.ticks.map((t) => (
                <li
                  key={t.value}
                  className="flex items-center justify-between gap-3 text-xs tabular-nums"
                >
                  <span className="flex items-center gap-1.5">
                    {t.reached ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <span className="text-muted-foreground/40 size-3.5 text-center leading-none">·</span>
                    )}
                    <span className={t.reached ? "font-medium" : "text-muted-foreground"}>
                      {t.label || (t.rate != null ? rate(t.rate) : "")}
                    </span>
                    {t.label && t.rate != null && (
                      <span className="text-muted-foreground">{rate(t.rate)}</span>
                    )}
                  </span>
                  <span className={t.reached ? "" : "text-muted-foreground"}>{format(t.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
