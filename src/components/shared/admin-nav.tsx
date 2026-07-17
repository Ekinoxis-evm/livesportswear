"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Activity,
  Percent,
  Megaphone,
  MapPin,
  ScanBarcode,
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
  { href: "/admin/performance", label: "Performance", icon: Activity, primary: false },
  { href: "/admin/commission", label: "Sales & Rewards setup", icon: Percent, primary: false },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone, primary: false },
  { href: "/admin/inventory", label: "Inventory", icon: ScanBarcode, primary: false },
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
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground",
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
