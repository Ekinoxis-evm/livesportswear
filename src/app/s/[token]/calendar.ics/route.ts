import { addDays } from "@/lib/scheduling/week";
import { businessDate } from "@/lib/business-date";
import { createServiceClient } from "@/lib/supabase/service";
import { buildEmployeeFeed } from "@/lib/ical";
import { overlappingCoworkerNames } from "@/lib/coworkers";

// Public, token-gated. No session; verify the magic token, then read via
// the service client. Return 404 (not 401) on miss — no token enumeration.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, name, location_id, location:locations(name, address, timezone)")
    .eq("magic_token", token)
    .maybeSingle();

  const location = emp?.location as
    | { name: string; address: string | null; timezone: string }
    | null
    | undefined;
  if (!emp || !location) {
    return new Response("Not found", { status: 404 });
  }

  const today = businessDate(location.timezone);
  // The whole store's published shifts in the window (not just this employee's),
  // so each event can name who else is on that shift (overlapping hours).
  const { data: shifts } = await supabase
    .from("shifts")
    .select(
      "id, employee_id, date, start_time, end_time, template:shift_templates(name), schedules!inner(status, location_id)",
    )
    .eq("schedules.location_id", emp.location_id)
    .eq("schedules.status", "published")
    .gte("date", addDays(today, -30))
    .lte("date", addDays(today, 90))
    .order("date");
  const allShifts = shifts ?? [];

  const { data: roster } = await supabase
    .from("employees")
    .select("id, name")
    .eq("location_id", emp.location_id);
  const nameOf = new Map((roster ?? []).map((e) => [e.id, e.name]));

  const feed = buildEmployeeFeed({
    employeeName: emp.name,
    location,
    shifts: allShifts
      .filter((s) => s.employee_id === emp.id)
      .map((s) => ({
        id: s.id,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        templateName: (s.template as { name: string } | null)?.name ?? null,
        coworkers: overlappingCoworkerNames(s, allShifts, nameOf),
      })),
  });

  return new Response(feed, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-cache, no-store, max-age=0",
    },
  });
}
