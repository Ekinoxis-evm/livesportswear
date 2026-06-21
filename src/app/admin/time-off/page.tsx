import { createServerClient } from "@/lib/supabase/server";
import { isLateSubmission } from "@/lib/scheduling/payroll";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DecisionActions } from "@/components/time-off/decision-actions";

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
};

const dateRange = (start: string, end: string) =>
  start === end ? start : `${start} – ${end}`;

export default async function TimeOffPage() {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("time_off_requests")
    .select(
      "id, start_date, end_date, reason, status, submitted_at, employee:employees(name)",
    )
    .order("submitted_at", { ascending: false });

  const requests = (data ?? [])
    .slice()
    .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Time off</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {pendingCount} pending request{pendingCount === 1 ? "" : "s"}.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load requests</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : requests.length === 0 ? (
        <Alert>
          <AlertTitle>No requests yet</AlertTitle>
          <AlertDescription>
            Employees submit time off from their personal schedule page.
          </AlertDescription>
        </Alert>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((r) => {
              const late = isLateSubmission(r.start_date, r.submitted_at);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {(r.employee as { name: string } | null)?.name ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {dateRange(r.start_date, r.end_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-48 truncate">
                    {r.reason ?? "—"}
                  </TableCell>
                  <TableCell>
                    {late && r.status === "pending" ? (
                      <Badge variant="destructive">Late</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {r.submitted_at.slice(0, 10)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.status === "approved"
                          ? "default"
                          : r.status === "rejected"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" ? (
                      <DecisionActions id={r.id} />
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
