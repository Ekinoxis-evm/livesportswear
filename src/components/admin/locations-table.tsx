"use client";

import { businessDate } from "@/lib/business-date";
import { weekStart } from "@/lib/scheduling/week";
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
import { LocationFormSheet } from "@/components/location/location-form-sheet";
import { LocationActiveToggle } from "@/components/location/location-actions";
import { CopyButton } from "@/components/shared/copy-button";
import type { Location } from "@/types/db";

export function LocationsTable({
  rows,
  appUrl,
}: {
  rows: Location[];
  appUrl: string;
}) {
  const { rows: sorted, sort, onSort } = useTableSort(rows, {
    name: (l) => l.name,
    slug: (l) => l.slug,
    timezone: (l) => l.timezone,
    status: (l) => (l.active ? 1 : 0),
  });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortKey="name" sort={sort} onSort={onSort}>Name</TableHead>
          <TableHead sortKey="slug" sort={sort} onSort={onSort}>Slug</TableHead>
          <TableHead sortKey="timezone" sort={sort} onSort={onSort}>Timezone</TableHead>
          <TableHead sortKey="status" sort={sort} onSort={onSort}>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((loc) => (
          <TableRow key={loc.id} className={loc.active ? "" : "opacity-60"}>
            <TableCell className="font-medium">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-full border"
                  style={{ backgroundColor: loc.color ?? "transparent" }}
                />
                {loc.name}
              </span>
            </TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {loc.slug}
            </TableCell>
            <TableCell className="text-muted-foreground">{loc.timezone}</TableCell>
            <TableCell>
              <Badge variant={loc.active ? "default" : "secondary"}>
                {loc.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                {loc.share_token && (
                  <CopyButton
                    value={`${appUrl}/w/${loc.share_token}/${weekStart(businessDate(loc.timezone))}`}
                    label="Copy schedule link"
                  />
                )}
                <LocationFormSheet location={loc}>
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                </LocationFormSheet>
                <LocationActiveToggle id={loc.id} active={loc.active} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
