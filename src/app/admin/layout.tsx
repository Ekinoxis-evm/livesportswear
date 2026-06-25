import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/server/auth";
import { AdminNav } from "@/components/shared/admin-nav";
import { AdminMobileNav } from "@/components/shared/admin-mobile-nav";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="bg-card hidden w-60 shrink-0 flex-col border-r p-4 md:flex">
        <div className="px-3 pb-6 text-lg font-semibold tracking-tight">
          Live
        </div>
        <AdminNav />
        <div className="mt-auto flex flex-col gap-2 px-3 pt-6">
          <span className="text-muted-foreground truncate text-xs">
            {user.email}
          </span>
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      <main className="flex-1">
        {/* Mobile top bar */}
        <header className="bg-background/80 sticky top-0 z-30 flex h-12 items-center border-b px-4 backdrop-blur md:hidden">
          <span className="text-base font-semibold tracking-tight">Live</span>
        </header>
        <div className="mx-auto max-w-7xl p-4 pb-24 md:p-6 md:pb-6">
          {children}
        </div>
      </main>

      <AdminMobileNav email={user.email ?? ""} />
    </div>
  );
}
