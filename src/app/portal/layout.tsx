import { requireEmployee } from "@/lib/auth";
import { signOut } from "@/server/auth";
import { Button } from "@/components/ui/button";
import { PortalNav } from "@/components/portal/portal-nav";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { employee } = await requireEmployee();

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 pb-24">
      <header className="flex items-center justify-between">
        <span className="text-base font-bold tracking-tight">LIVE!</span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">{employee.name}</span>
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      {children}
      <PortalNav />
    </div>
  );
}
