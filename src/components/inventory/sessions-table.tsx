"use client";

import Link from "next/link";
import { ClipboardCheck, PackagePlus } from "lucide-react";
import { useTableSort } from "@/lib/use-table-sort";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type SessionRow = {
  id: string;
  storeName: string;
  note: string | null;
  restock: boolean;
  startedAt: string; // ISO, for sorting
  startedLabel: string; // pre-formatted in the store's tz
  status: string; // "open" | "final"
  countedUnits: number | null;
  expectedUnits: number | null;
};

export function SessionsTable({ rows }: { rows: SessionRow[] }) {
  const { rows: sorted, sort, onSort } = useTableSort(
    rows,
    {
      store: (c) => c.storeName,
      type: (c) => (c.restock ? "receiving" : "counting"),
      started: (c) => c.startedAt,
      status: (c) => c.status,
      units: (c) => c.countedUnits,
      expected: (c) => c.expectedUnits,
    },
    { key: "started", dir: "desc" },
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortKey="store" sort={sort} onSort={onSort}>Store</TableHead>
          <TableHead sortKey="type" sort={sort} onSort={onSort}>Type</TableHead>
          <TableHead sortKey="started" sort={sort} onSort={onSort}>Started</TableHead>
          <TableHead sortKey="status" sort={sort} onSort={onSort}>Status</TableHead>
          <TableHead sortKey="units" sort={sort} onSort={onSort} className="text-right">
            <span className="hidden sm:inline">Counted / </span>Units
          </TableHead>
          <TableHead sortKey="expected" sort={sort} onSort={onSort} className="hidden text-right sm:table-cell">
            Expected
          </TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">
              {c.storeName}
              {c.note && (
                <span className="text-muted-foreground ml-2 text-xs">{c.note}</span>
              )}
            </TableCell>
            <TableCell>
              <span
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium " +
                  (c.restock
                    ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
                    : "border-primary/40 text-primary")
                }
              >
                {c.restock ? (
                  <PackagePlus className="size-3.5" />
                ) : (
                  <ClipboardCheck className="size-3.5" />
                )}
                {c.restock ? "Receiving" : "Counting"}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {c.startedLabel}
            </TableCell>
            <TableCell>
              {c.status === "open" ? (
                <Badge>{c.restock ? "receiving" : "counting"}</Badge>
              ) : (
                <Badge variant="secondary">{c.restock ? "received" : "final"}</Badge>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {c.countedUnits ?? "—"}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">
              {c.restock ? "—" : (c.expectedUnits ?? "—")}
            </TableCell>
            <TableCell className="text-right">
              <Link
                href={`/admin/inventory/${c.id}`}
                className="text-primary text-sm underline-offset-4 hover:underline"
              >
                {c.status === "open" ? "Continue" : "Report"}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
