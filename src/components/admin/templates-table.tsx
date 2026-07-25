"use client";

import { useTableSort } from "@/lib/use-table-sort";
import type { ShiftTemplate } from "@/types/db";
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
import { TemplateFormSheet } from "@/components/template/template-form-sheet";
import { TemplateActiveToggle } from "@/components/template/template-actions";

const hhmm = (t: string) => t.slice(0, 5);

export type TemplateRow = ShiftTemplate & { location: { name: string } | null };

export function TemplatesTable({
  rows,
  locations,
}: {
  rows: TemplateRow[];
  locations: { id: string; name: string }[];
}) {
  const { rows: sorted, sort, onSort } = useTableSort(rows, {
    name: (t) => t.name,
    location: (t) => t.location?.name ?? null,
    hours: (t) => t.start_time,
    headcount: (t) => t.default_headcount,
    status: (t) => (t.active ? 1 : 0),
  });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortKey="name" sort={sort} onSort={onSort}>Name</TableHead>
          <TableHead sortKey="location" sort={sort} onSort={onSort}>Location</TableHead>
          <TableHead sortKey="hours" sort={sort} onSort={onSort}>Hours</TableHead>
          <TableHead sortKey="headcount" sort={sort} onSort={onSort}>Headcount</TableHead>
          <TableHead sortKey="status" sort={sort} onSort={onSort}>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((tpl) => (
          <TableRow key={tpl.id} className={tpl.active ? "" : "opacity-60"}>
            <TableCell className="font-medium">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full border"
                  style={{ backgroundColor: tpl.color ?? "transparent" }}
                />
                {tpl.name}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {tpl.location?.name ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {hhmm(tpl.start_time)} – {hhmm(tpl.end_time)}
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {tpl.default_headcount}
            </TableCell>
            <TableCell>
              <Badge variant={tpl.active ? "default" : "secondary"}>
                {tpl.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <TemplateFormSheet template={tpl} locations={locations}>
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                </TemplateFormSheet>
                <TemplateActiveToggle id={tpl.id} active={tpl.active} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
