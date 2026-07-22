"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, CalendarDays, Trophy, Settings, Contact } from "lucide-react";
import { cn } from "@/lib/utils";

// Performance is a tab hub — /portal/sales belongs to it, so it claims that
// path too and stays lit while the rep moves between its tabs.
const ITEMS = [
  { href: "/portal", label: "Performance", icon: ChartColumn, also: ["/portal/sales"] },
  { href: "/portal/clients", label: "Clients", icon: Contact },
  { href: "/portal/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/portal/rewards", label: "Rewards", icon: Trophy },
  { href: "/portal/settings", label: "Settings", icon: Settings },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="bg-background/90 fixed inset-x-0 bottom-0 z-10 border-t backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-3xl">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.also?.some((p) => pathname.startsWith(p)) ?? false);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
