"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTableSort } from "@/lib/use-table-sort";

/** Serializable per-row state — the badge is derived here rather than passed as
 *  JSX, so the server page stays a plain data loader. */
export type DayAttendanceRow = {
  employeeId: string;
  name: string;
  entryLabel: string;
  entryStatus: string; // stampStatus(): validated | self | missed | pending | none
  entryValidator: string | null;
  exitLabel: string | null; // null = still on the floor
  exitStatus: string;
  exitValidator: string | null;
  breakMinutes: number;
  overBreak: boolean;
  hours: number | null;
};

function StampBadge({
  status,
  validator,
  kind,
}: {
  status: string;
  validator: string | null;
  kind: "entry" | "exit";
}) {
  if (status === "none") return null;
  if (status === "validated")
    return <span className="text-emerald-600">✓ {validator ?? "validated"}</span>;
  if (status === "self")
    return (
      <span className="text-amber-600">
        ⚑ {kind === "entry" ? "first in" : "last out"}
      </span>
    );
  if (status === "missed")
    return <span className="text-destructive">✗ missed check-out</span>;
  return <span className="text-muted-foreground">⏳ pending</span>;
}

export function DayAttendanceTable({ rows }: { rows: DayAttendanceRow[] }) {
  const {
    rows: shown,
    sort,
    onSort,
  } = useTableSort(
    rows,
    {
      employee: (r) => r.name,
      entry: (r) => r.entryLabel,
      exit: (r) => r.exitLabel,
      break: (r) => r.breakMinutes,
      hours: (r) => r.hours,
    },
    { key: "entry", dir: "asc" },
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortKey="employee" sort={sort} onSort={onSort}>
            Employee
          </TableHead>
          <TableHead sortKey="entry" sort={sort} onSort={onSort}>
            Entry
          </TableHead>
          <TableHead sortKey="exit" sort={sort} onSort={onSort}>
            Exit
          </TableHead>
          <TableHead sortKey="break" sort={sort} onSort={onSort} className="text-right">
            Break
          </TableHead>
          <TableHead sortKey="hours" sort={sort} onSort={onSort} className="text-right">
            Hours
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shown.map((r) => (
          <TableRow key={r.employeeId}>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell className="tabular-nums">
              {r.entryLabel}{" "}
              <span className="text-xs">
                <StampBadge status={r.entryStatus} validator={r.entryValidator} kind="entry" />
              </span>
            </TableCell>
            <TableCell className="tabular-nums">
              {r.exitLabel ? (
                <>
                  {r.exitLabel}{" "}
                  <span className="text-xs">
                    <StampBadge status={r.exitStatus} validator={r.exitValidator} kind="exit" />
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">on floor</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.breakMinutes === 0 ? (
                "—"
              ) : (
                <span className={r.overBreak ? "text-destructive font-semibold" : undefined}>
                  {r.breakMinutes}m{r.overBreak && " ⚑"}
                </span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.hours != null ? r.hours.toFixed(1) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
