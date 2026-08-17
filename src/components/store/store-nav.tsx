"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  Hand,
  UserCheck,
  CalendarDays,
  ChartColumn,
  Trophy,
  Users,
  PackagePlus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Sales sits in the middle as the raised primary button — it's the screen the
// floor lives on; the other tabs are regular ones around it.
const LEFT = [
  { href: "/store/checkin", label: "Check-in", icon: UserCheck },
  { href: "/store/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/store/receiving", label: "Receiving", icon: PackagePlus },
];
const RIGHT = [
  { href: "/store/performance", label: "Performance", icon: ChartColumn },
  { href: "/store/clients", label: "Clients", icon: Users },
  { href: "/store/rewards", label: "Rewards", icon: Trophy },
];

// Rendered inside <Link>, so useLinkStatus reflects THIS tab's navigation —
// swap the icon for a spinner the instant it's tapped (kiosk feels responsive
// even while the server renders the next page).
function TabInner({ icon: Icon, label }: { icon: typeof Hand; label: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending ? <Loader2 className="size-6 animate-spin" /> : <Icon className="size-6" />}
      {label}
    </>
  );
}

function Tab({
  href,
  label,
  icon,
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
      // NO PREFETCH. This is one always-on iPad, and AutoRefresh re-renders the
      // tree every 45s — with prefetch on, each cycle re-prefetched all five
      // tabs, and every prefetch of these dynamic authenticated routes invokes
      // the function and calls Shopify. Production logs showed ~6-8 server
      // renders per 45s cycle whether or not anyone touched the screen.
      // Taps stay responsive without it: useLinkStatus swaps in a spinner
      // immediately and the route's loading.tsx paints a skeleton.
      prefetch={false}
      className={cn(
        "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-sm font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <TabInner icon={icon} label={label} />
    </Link>
  );
}

function SalesInner() {
  const { pending } = useLinkStatus();
  return pending ? <Loader2 className="size-7 animate-spin" /> : <Hand className="size-7" />;
}

export function StoreNav() {
  const pathname = usePathname();
  return (
    <nav className="bg-background/90 supports-[backdrop-filter]:bg-background/70 fixed inset-x-0 bottom-0 z-10 border-t backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-stretch">
        {LEFT.map((item) => (
          <Tab key={item.href} {...item} active={pathname === item.href} />
        ))}
        <Link
          href="/store"
          aria-label="Turn"
          prefetch={false}
          className="flex flex-1 flex-col items-center justify-end gap-0.5 pb-1.5"
        >
          <span
            className={cn(
              "bg-primary text-primary-foreground ring-background -mt-6 flex size-16 items-center justify-center rounded-full shadow-lg ring-4 transition-transform",
              pathname === "/store" && "ring-primary/40 scale-105",
            )}
          >
            <SalesInner />
          </span>
          <span
            className={cn(
              "text-xs font-semibold",
              pathname === "/store" ? "text-primary" : "text-muted-foreground",
            )}
          >
            Turn
          </span>
        </Link>
        {RIGHT.map((item) => (
          <Tab key={item.href} {...item} active={pathname === item.href} />
        ))}
      </div>
    </nav>
  );
}
