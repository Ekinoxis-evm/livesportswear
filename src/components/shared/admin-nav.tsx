"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  CalendarOff,
  Percent,
  Megaphone,
  MapPin,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  primary: boolean; // shown in the mobile bottom bar
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true },
  { href: "/admin/schedules", label: "Schedules", icon: CalendarDays, primary: true },
  { href: "/admin/employees", label: "Employees", icon: Users, primary: true },
  { href: "/admin/time-off", label: "Time off", icon: CalendarOff, primary: true },
  { href: "/admin/commission", label: "Commission", icon: Percent, primary: false },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone, primary: false },
  { href: "/admin/locations", label: "Locations", icon: MapPin, primary: false },
  { href: "/admin/settings", label: "Settings", icon: Settings, primary: false },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
