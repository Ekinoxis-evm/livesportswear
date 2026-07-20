"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Percent,
  Megaphone,
  MapPin,
  ScanBarcode,
  Settings,
  Contact,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string; icon: LucideIcon };
export type NavGroup = {
  label: string;
  icon: LucideIcon;
  href: string; // the group header itself navigates here (Profiles)
  children: { href: string; label: string }[];
};
export type NavEntry = (NavLink & { primary: boolean }) | (NavGroup & { primary: boolean });

const isGroup = (e: NavEntry): e is NavGroup & { primary: boolean } =>
  "children" in e;

// The Employees group keeps everyone's routes where they are — it's a nav
// grouping, not a route move. Rewards/Commission both open the "Sales &
// Rewards setup" page, deep-linked to their section.
export const NAV_ITEMS: NavEntry[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, primary: true },
  {
    label: "Employees",
    icon: Users,
    href: "/admin/employees",
    primary: true,
    children: [
      { href: "/admin/employees", label: "Profiles" },
      { href: "/admin/schedules", label: "Schedule" },
      { href: "/admin/performance", label: "Performance" },
      { href: "/admin/commission#rewards", label: "Rewards" },
      { href: "/admin/commission#commission", label: "Commission" },
    ],
  },
  { href: "/admin/clients", label: "Clients", icon: Contact, primary: false },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone, primary: false },
  { href: "/admin/inventory", label: "Inventory", icon: ScanBarcode, primary: true },
  { href: "/admin/locations", label: "Locations", icon: MapPin, primary: false },
  { href: "/admin/settings", label: "Settings", icon: Settings, primary: false },
];

/** Prefix-match, ignoring any hash. */
export function isActive(pathname: string, href: string): boolean {
  const path = href.split("#")[0];
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Flat list of every destination (group children spread) for the mobile sheet. */
export function flatNav(): NavLink[] {
  return NAV_ITEMS.flatMap((e) =>
    isGroup(e)
      ? e.children.map((c) => ({ ...c, icon: e.icon }))
      : [{ href: e.href, label: e.label, icon: e.icon }],
  );
}

export function AdminNav() {
  const pathname = usePathname();
  const linkClass = (active: boolean, indent = false) =>
    cn(
      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      indent && "ml-4 py-1.5",
      active
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground",
    );

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((entry) => {
        const Icon = entry.icon;
        if (!isGroup(entry)) {
          return (
            <Link key={entry.href} href={entry.href} className={linkClass(isActive(pathname, entry.href))}>
              <Icon className="size-4 shrink-0" />
              {entry.label}
            </Link>
          );
        }
        const groupActive = entry.children.some((c) => isActive(pathname, c.href));
        return (
          <div key={entry.label} className="flex flex-col gap-1">
            <Link href={entry.href} className={linkClass(groupActive)}>
              <Icon className="size-4 shrink-0" />
              {entry.label}
            </Link>
            {entry.children.map((c) => (
              <Link key={c.label} href={c.href} className={linkClass(isActive(pathname, c.href), true)}>
                {c.label}
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
