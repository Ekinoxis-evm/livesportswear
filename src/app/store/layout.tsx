import { requireStore } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { signOut } from "@/server/auth";
import { businessDate } from "@/lib/business-date";
import { weekdayName } from "@/lib/weekdays";
import { shortDate } from "@/lib/format-date";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AutoRefresh } from "@/components/store/auto-refresh";
import { VersionGuard } from "@/components/store/version-guard";
import { StoreNav } from "@/components/store/store-nav";
import { Button } from "@/components/ui/button";

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locationId } = await requireStore();
  const service = createServiceClient();
  const { data: loc } = await service
    .from("locations")
    .select("name, timezone")
    .eq("id", locationId)
    .maybeSingle();
  const bd = businessDate(loc?.timezone ?? "UTC");
  const served =
    process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-6 py-4">
          <div>
            <p className="text-sidebar-foreground/70 text-xs font-semibold uppercase tracking-wide">
              LIVE! · Store screen
            </p>
            <h1 className="text-lg font-bold">{loc?.name ?? "Store"}</h1>
            <p className="text-sidebar-foreground/70 text-sm">
              {weekdayName(bd)} · {shortDate(bd)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle className="text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground" />
            <form action={signOut}>
              <Button
                variant="ghost"
                size="sm"
                type="submit"
                className="text-sidebar-foreground/60 hover:bg-white/10 hover:text-sidebar-foreground"
              >
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 p-4 pb-24 sm:p-6 sm:pb-24">
        {children}
      </div>
      <StoreNav />
      <AutoRefresh />
      <VersionGuard served={served} />
    </div>
  );
}
