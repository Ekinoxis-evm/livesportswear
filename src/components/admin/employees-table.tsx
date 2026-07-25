"use client";

import Link from "next/link";
import { formatMoney } from "@/lib/commission";
import { useTableSort } from "@/lib/use-table-sort";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmployeeRowActions } from "@/components/employee/employee-actions";

export type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  avatarColor: string | null;
  active: boolean;
  magicToken: string;
  rate: number | null;
};

export function EmployeesTable({
  rows,
  currency,
  appUrl,
}: {
  rows: EmployeeRow[];
  currency: string;
  appUrl: string;
}) {
  const { rows: sorted, sort, onSort } = useTableSort(rows, {
    name: (e) => e.name,
    email: (e) => e.email,
    rate: (e) => e.rate,
  });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortKey="name" sort={sort} onSort={onSort}>Name</TableHead>
          <TableHead sortKey="email" sort={sort} onSort={onSort} className="hidden sm:table-cell">Email</TableHead>
          <TableHead sortKey="rate" sort={sort} onSort={onSort} className="tabular-nums">Rate</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((emp) => (
          <TableRow key={emp.id} className={emp.active ? "" : "opacity-60"}>
            <TableCell className="font-medium">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full border"
                  style={{ backgroundColor: emp.avatarColor ?? "transparent" }}
                />
                <Link href={`/admin/employees/${emp.id}`} className="hover:underline">
                  {emp.name}
                </Link>
                {!emp.active && <Badge variant="secondary">Inactive</Badge>}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground hidden sm:table-cell">
              {emp.email}
            </TableCell>
            <TableCell className="tabular-nums">
              {emp.rate != null ? `${formatMoney(emp.rate, currency)}/h` : "—"}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Link href={`/admin/employees/${emp.id}`}>
                  <Button variant="ghost" size="sm">
                    Details
                  </Button>
                </Link>
                <EmployeeRowActions
                  id={emp.id}
                  active={emp.active}
                  token={emp.magicToken}
                  appUrl={appUrl}
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
