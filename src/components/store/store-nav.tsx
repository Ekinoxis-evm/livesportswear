"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hand, UserCheck, CalendarDays, ChartColumn, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

// Sales sits in the middle as the raised primary button — it's the screen the
// floor lives on; the other four are regular tabs around it.
const LEFT = [
  { href: "/store/checkin", label: "Check-in", icon: UserCheck },
  { href: "/store/schedule", label: "Schedule", icon: CalendarDays },
];
const RIGHT = [
  { href: "/store/performance", label: "Performance", icon: ChartColumn },
  { href: "/store/rewards", label: "Rewards", icon: Trophy },
];

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Hand;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-sm font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-6" />
      {label}
    </Link>
  );
}

export function StoreNav() {
  const pathname = usePathname();
  return (
    <nav className="bg-background/90 supports-[backdrop-filter]:bg-background/70 fixed inset-x-0 bottom-0 z-10 border-t backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-stretch">
        {LEFT.map((item) => (
          <Tab key={item.href} {...item} active={pathname === item.href} />
        ))}
        <Link
          href="/store"
          aria-label="Sales"
          className="flex flex-1 flex-col items-center justify-end gap-0.5 pb-1.5"
        >
          <span
            className={cn(
              "bg-primary text-primary-foreground ring-background -mt-6 flex size-16 items-center justify-center rounded-full shadow-lg ring-4 transition-transform",
              pathname === "/store" && "ring-primary/40 scale-105",
            )}
          >
            <Hand className="size-7" />
          </span>
          <span
            className={cn(
              "text-xs font-semibold",
              pathname === "/store" ? "text-primary" : "text-muted-foreground",
            )}
          >
            Sales
          </span>
        </Link>
        {RIGHT.map((item) => (
          <Tab key={item.href} {...item} active={pathname === item.href} />
        ))}
      </div>
    </nav>
  );
}
