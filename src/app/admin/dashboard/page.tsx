import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { SPRINT_ANCHOR_MONDAY } from "@/lib/payroll-config";
import { sprintRange, payday } from "@/lib/scheduling/payroll";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const today = new Date().toISOString().slice(0, 10);
  const sprint = sprintRange(SPRINT_ANCHOR_MONDAY, today);
  const nextPayday = payday(SPRINT_ANCHOR_MONDAY, today);

  const { count: pending } = await supabase
    .from("time_off_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Current pay sprint</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {sprint.start} – {sprint.end}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Next payday</CardDescription>
            <CardTitle className="text-lg tabular-nums">{nextPayday}</CardTitle>
          </CardHeader>
        </Card>

        <Link href="/admin/time-off" className="block">
          <Card className="hover:border-primary transition-colors">
            <CardHeader>
              <CardDescription>Pending time off</CardDescription>
              <CardTitle className="text-lg tabular-nums">
                {pending ?? 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
          <CardDescription>
            This week & next at a glance, coverage health, and reminders.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
