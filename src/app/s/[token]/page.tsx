import { notFound } from "next/navigation";
import { addDays, isoWeekday } from "@/lib/scheduling/week";
import { createServiceClient } from "@/lib/supabase/service";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hhmm = (t: string) => t.slice(0, 5);

export default async function PublicSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: emp } = await supabase
    .from("employees")
    .select("id, name, location:locations(name)")
    .eq("magic_token", token)
    .maybeSingle();

  if (!emp) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const { data: shifts } = await supabase
    .from("shifts")
    .select(
      "id, date, start_time, end_time, template:shift_templates(name), schedules!inner(status)",
    )
    .eq("employee_id", emp.id)
    .eq("schedules.status", "published")
    .gte("date", today)
    .lte("date", addDays(today, 28))
    .order("date")
    .order("start_time");

  const locationName =
    (emp.location as { name: string } | null)?.name ?? "Live Active Wear";
  const rows = shifts ?? [];

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <span className="text-primary text-sm font-semibold tracking-widest">
          LIVE
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{emp.name}</h1>
        <p className="text-muted-foreground text-sm">
          {locationName} · upcoming shifts
        </p>
      </header>

      {rows.length === 0 ? (
        <Alert>
          <AlertTitle>No upcoming shifts</AlertTitle>
          <AlertDescription>
            You have no published shifts in the next four weeks.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent className="flex flex-col divide-y p-0">
            {rows.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex w-12 flex-col items-center">
                    <span className="text-muted-foreground text-xs">
                      {WD[isoWeekday(s.date) - 1]}
                    </span>
                    <span className="text-lg font-semibold tabular-nums">
                      {s.date.slice(8, 10)}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {(s.template as { name: string } | null)?.name ?? "Shift"}
                    </span>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {hhmm(s.start_time)} – {hhmm(s.end_time)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscribe in your calendar</CardTitle>
          <CardDescription>
            Add this link in Apple Calendar, Google Calendar, or Outlook to keep
            your shifts in sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href={`/s/${token}/calendar.ics`}
            className="text-primary text-sm break-all underline"
          >
            /s/{token}/calendar.ics
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
