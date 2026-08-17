import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { weekdayName } from "@/lib/weekdays";
import { shortDate } from "@/lib/format-date";

/**
 * Step back through the days on the kiosk. Plain `<Link>`s rather than a date
 * input: the floor iPad has no keyboard worth typing a date on, and the answer
 * is nearly always "yesterday" or "the day before".
 *
 * Bounds are the caller's (and are re-checked server-side) — this only renders
 * a dead arrow when there is nowhere to go, so a rep can't tap into the future.
 */
export function DayNav({
  date,
  prev,
  next,
  tab,
  basePath = "/store/performance",
}: {
  date: string; // yyyy-MM-dd, the day being viewed
  prev: string | null; // null at the oldest day we let them reach
  next: string | null; // null on today
  tab?: string;
  basePath?: string;
}) {
  const href = (d: string) =>
    `${basePath}?date=${d}${tab ? `&tab=${tab}` : ""}`;

  return (
    <div className="flex items-center justify-between gap-2">
      <Arrow href={prev ? href(prev) : null} label="Previous day">
        <ChevronLeft className="size-5" />
      </Arrow>

      <p className="flex min-w-0 flex-col items-center text-center leading-tight">
        <span className="text-base font-semibold">{weekdayName(date)}</span>
        <span className="text-muted-foreground text-sm">{shortDate(date)}</span>
      </p>

      <Arrow href={next ? href(next) : null} label="Next day">
        <ChevronRight className="size-5" />
      </Arrow>
    </div>
  );
}

function Arrow({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const base =
    "flex h-12 w-14 items-center justify-center rounded-md border text-sm font-medium";
  if (!href) {
    return (
      <span
        aria-disabled
        className={cn(base, "text-muted-foreground/40 opacity-50")}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      prefetch={false}
      aria-label={label}
      className={cn(base, "hover:bg-muted")}
    >
      {children}
    </Link>
  );
}
