"use client";

import { formatPct } from "@/lib/conversion";
import { useTableSort } from "@/lib/use-table-sort";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type PerformancePersonRow = {
  employeeId: string;
  name: string;
  attended: number;
  sold: number;
  contacts: number;
  conversion: number;
};

/** Admin Performance→Daily "By employee" table — sortable per column. */
export function PerformancePeopleTable({ rows }: { rows: PerformancePersonRow[] }) {
  const { rows: sorted, sort, onSort } = useTableSort(rows, {
    name: (p) => p.name,
    attended: (p) => p.attended,
    sold: (p) => p.sold,
    contacts: (p) => p.contacts,
    conversion: (p) => p.conversion,
  });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortKey="name" sort={sort} onSort={onSort}>Employee</TableHead>
          <TableHead sortKey="attended" sort={sort} onSort={onSort} className="text-right">Attended</TableHead>
          <TableHead sortKey="sold" sort={sort} onSort={onSort} className="text-right">Sold</TableHead>
          <TableHead sortKey="contacts" sort={sort} onSort={onSort} className="text-right">Contacts</TableHead>
          <TableHead sortKey="conversion" sort={sort} onSort={onSort} className="text-right">Conversion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((p) => (
          <TableRow key={p.employeeId}>
            <TableCell className="font-medium">{p.name}</TableCell>
            <TableCell className="text-right tabular-nums">{p.attended}</TableCell>
            <TableCell className="text-right tabular-nums">{p.sold}</TableCell>
            <TableCell className="text-right tabular-nums">{p.contacts}</TableCell>
            <TableCell className="text-right tabular-nums">{formatPct(p.conversion)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
