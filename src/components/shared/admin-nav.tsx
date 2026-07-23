"use client";

import { useState } from "react";
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
  ChevronDown,
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
// grouping, not a route move. Rewards and Commission are now their own pages.
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
      { href: "/admin/rewards", label: "Rewards" },
      { href: "/admin/commission", label: "Commission" },
    ],
  },
  { href: "/admin/clients", label: "Clients", icon: Contact, primary: false },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone, primary: false },
  // Same call as the Employees group: the inventory routes DON'T move, so every
  // existing /admin/inventory/* link keeps working — Products just gathers them
  // under the catalog.
  {
    label: "Products",
    icon: ScanBarcode,
    href: "/admin/products",
    primary: true,
    children: [
      { href: "/admin/products", label: "Catalog" },
      { href: "/admin/inventory", label: "Counting" },
      { href: "/admin/inventory/book", label: "Inventory book" },
      { href: "/admin/inventory/push", label: "Push to Shopify" },
    ],
  },
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
  // Groups open by default when one of their routes is active; an explicit
  // toggle overrides that. The sidebar lives in the admin layout, so this state
  // already survives client-side navigation — only a hard reload resets it,
  // which isn't worth an external store to persist (a localStorage restore
  // needs setState in an effect, which the React Compiler rejects here).
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const toggle = (label: string, currentlyOpen: boolean) =>
    setOverrides((prev) => ({ ...prev, [label]: !currentlyOpen }));

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
        const open = overrides[entry.label] ?? groupActive;
        return (
          <div key={entry.label} className="flex flex-col gap-1">
            <div className="flex items-center">
              <Link href={entry.href} className={cn(linkClass(groupActive), "flex-1")}>
                <Icon className="size-4 shrink-0" />
                {entry.label}
              </Link>
              <button
                type="button"
                onClick={() => toggle(entry.label, open)}
                aria-expanded={open}
                aria-label={`${open ? "Collapse" : "Expand"} ${entry.label}`}
                className="text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground rounded-md p-1.5"
              >
                <ChevronDown
                  className={cn("size-4 transition-transform", !open && "-rotate-90")}
                />
              </button>
            </div>
            {open &&
              entry.children.map((c) => (
                <Link
                  key={c.label}
                  href={c.href}
                  className={linkClass(isActive(pathname, c.href), true)}
                >
                  {c.label}
                </Link>
              ))}
          </div>
        );
      })}
    </nav>
  );
}
