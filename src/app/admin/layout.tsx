import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/server/auth";
import { AdminNav } from "@/components/shared/admin-nav";
import { AdminMobileNav } from "@/components/shared/admin-mobile-nav";
import { BrandMark } from "@/components/shared/brand-mark";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar — the brand's forest green, constant in both themes */}
      <aside className="bg-sidebar text-sidebar-foreground hidden w-60 shrink-0 flex-col p-4 md:flex">
        <div className="flex items-center gap-2.5 px-3 pb-6">
          <BrandMark size={32} />
          <span className="text-xl font-bold tracking-tight">LIVE!</span>
        </div>
        <AdminNav />
        <div className="border-sidebar-border mt-auto flex flex-col gap-2 border-t px-3 pt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sidebar-foreground/60 min-w-0 truncate text-xs">
              {user.email}
            </span>
            <ThemeToggle className="text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground" />
          </div>
          <form action={signOut}>
            <Button
              variant="outline"
              size="sm"
              type="submit"
              className="border-sidebar-border text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground w-full bg-transparent"
            >
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <header className="bg-background/80 sticky top-0 z-30 flex h-12 items-center justify-between border-b px-4 backdrop-blur md:hidden">
          <span className="flex items-center gap-2">
            <BrandMark size={24} />
            <span className="text-base font-bold tracking-tight">LIVE!</span>
          </span>
          <ThemeToggle />
        </header>
        <div className="mx-auto max-w-7xl p-4 pb-24 md:p-6 md:pb-6">
          {children}
        </div>
      </main>

      <AdminMobileNav email={user.email ?? ""} />
    </div>
  );
}
