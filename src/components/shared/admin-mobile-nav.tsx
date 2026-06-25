"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NAV_ITEMS, isActive } from "@/components/shared/admin-nav";
import { signOut } from "@/server/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function AdminMobileNav({ email }: { email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = NAV_ITEMS.filter((i) => i.primary);

  return (
    <nav className="bg-card fixed inset-x-0 bottom-0 z-40 flex border-t md:hidden">
      {primary.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[11px]",
              active ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {item.label}
          </Link>
        );
      })}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button
              type="button"
              className="text-muted-foreground flex flex-1 flex-col items-center gap-1 py-2 text-[11px]"
            >
              <Menu className="size-5" />
              More
            </button>
          }
        />
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-4">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
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
            <form action={signOut} className="mt-3">
              <Button variant="outline" size="sm" type="submit" className="w-full">
                Sign out
              </Button>
            </form>
            <p className="text-muted-foreground mt-2 truncate text-center text-xs">
              {email}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
