import Link from "next/link";
import { PackagePlus } from "lucide-react";
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
import { ReminderPopup, type DueReminder } from "@/components/store/reminder-popup";
import { dueSlot, reminderTimes } from "@/lib/reminders";
import { Button } from "@/components/ui/button";
import { formatInTimeZone } from "date-fns-tz";

/**
 * The one recurring chore the floor is currently behind on, or null.
 *
 * Lives in the layout so it covers every kiosk tab, and rides the existing 45s
 * AutoRefresh rather than adding a poll of its own. Silent once the day is
 * closed: the closer is cashing up, and nagging them to spray the perfume at
 * that point is just noise.
 */
async function dueReminderFor(
  locationId: string,
  tz: string,
  bd: string,
): Promise<DueReminder | null> {
  const service = createServiceClient();

  const [{ data: reminders }, { data: day }] = await Promise.all([
    service
      .from("store_reminders")
      .select("id, label, note, start_time, end_time, interval_minutes")
      .eq("location_id", locationId)
      .eq("active", true),
    service
      .from("floor_days")
      .select("closed_at")
      .eq("location_id", locationId)
      .eq("business_date", bd)
      .maybeSingle(),
  ]);
  if (!reminders?.length || day?.closed_at) return null;

  const { data: acks } = await service
    .from("store_reminder_acks")
    .select("reminder_id, due_at")
    .eq("business_date", bd)
    .in(
      "reminder_id",
      reminders.map((r) => r.id),
    );

  const now = formatInTimeZone(new Date(), tz, "HH:mm");
  for (const r of reminders) {
    const done = (acks ?? [])
      .filter((a) => a.reminder_id === r.id)
      // Postgres hands back "HH:mm:ss"; the generated slots are "HH:mm".
      .map((a) => a.due_at.slice(0, 5));
    const slot = dueSlot(
      reminderTimes({
        startTime: r.start_time,
        endTime: r.end_time,
        intervalMinutes: r.interval_minutes,
      }),
      now,
      done,
    );
    // One at a time — two popups stacked on the floor screen is a wall, not a
    // reminder. The next one comes up on the following refresh.
    if (slot) return { id: r.id, label: r.label, note: r.note, dueAt: slot };
  }
  return null;
}

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

  // A new-stock arrival waiting to be counted surfaces as a banner (there's no
  // room for a 6th nav tab) — the "Receiving/Count" area only exists while a
  // delivery is being counted.
  const { data: arrival } = await service
    .from("inventory_counts")
    .select("id")
    .eq("location_id", locationId)
    .eq("kind", "restock")
    .eq("status", "counting")
    .limit(1)
    .maybeSingle();

  const due = await dueReminderFor(locationId, loc?.timezone ?? "UTC", bd);

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
      {arrival && (
        <Link
          href="/store/receiving"
          className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-200 flex items-center justify-center gap-2 border-b border-amber-500/40 px-6 py-2.5 text-sm font-semibold"
        >
          <PackagePlus className="size-4" /> New arrival to count — tap to start
        </Link>
      )}
      <div className="mx-auto w-full max-w-3xl flex-1 p-4 pb-24 sm:p-6 sm:pb-24">
        {children}
      </div>
      <StoreNav />
      <AutoRefresh />
      <VersionGuard served={served} />
      <ReminderPopup reminder={due} />
    </div>
  );
}
