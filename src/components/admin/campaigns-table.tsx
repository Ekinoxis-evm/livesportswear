"use client";

import { formatMoney } from "@/lib/commission";
import { useTableSort } from "@/lib/use-table-sort";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type CampaignRow = {
  id: string;
  name: string;
  spend: number;
  revenue: number;
  purchases: number;
};

const roas = (c: CampaignRow) => (c.spend > 0 ? c.revenue / c.spend : null);

export function CampaignsTable({
  rows,
  currency,
}: {
  rows: CampaignRow[];
  currency: string;
}) {
  const { rows: sorted, sort, onSort } = useTableSort(
    rows,
    { campaign: (c) => c.name, spend: (c) => c.spend, revenue: (c) => c.revenue, roas },
    { key: "spend", dir: "desc" },
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead sortKey="campaign" sort={sort} onSort={onSort}>Campaign</TableHead>
          <TableHead sortKey="spend" sort={sort} onSort={onSort} className="text-right">Spend</TableHead>
          <TableHead sortKey="revenue" sort={sort} onSort={onSort} className="hidden text-right sm:table-cell">Revenue</TableHead>
          <TableHead sortKey="roas" sort={sort} onSort={onSort} className="text-right">ROAS</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">{c.name}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatMoney(c.spend, currency)}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums sm:table-cell">
              {formatMoney(c.revenue, currency)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {c.spend > 0 ? `${(c.revenue / c.spend).toFixed(2)}×` : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
