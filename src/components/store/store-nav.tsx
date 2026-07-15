"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Hand, UserCheck, ChartColumn, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/store", label: "Sales", icon: Hand },
  { href: "/store/checkin", label: "Check-in", icon: UserCheck },
  { href: "/store/performance", label: "Performance", icon: ChartColumn },
  { href: "/store/rewards", label: "Rewards", icon: Trophy },
];

export function StoreNav() {
  const pathname = usePathname();
  return (
    <nav className="bg-background/90 fixed inset-x-0 bottom-0 z-10 border-t backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-3xl">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-sm font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-6" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
