"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/portal", label: "Overview" },
  { href: "/portal/sales", label: "Sales" },
  { href: "/portal/clients", label: "Clients" },
];

export function PortalPerformanceTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b">
      {TABS.map((t) => {
        const active =
          t.href === "/portal" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
