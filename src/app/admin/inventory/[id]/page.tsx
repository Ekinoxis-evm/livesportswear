import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "date-fns-tz";
import {
  buildInventoryCsv,
  countTotals,
  varianceRows,
  type CountItem,
} from "@/lib/inventory-count";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CountScreen } from "@/components/inventory/count-screen";
import { DownloadCsvButton } from "@/components/inventory/download-csv-button";

export default async function InventoryCountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: count } = await supabase
    .from("inventory_counts")
    .select("id, location_id, status, note, started_at, finalized_at")
    .eq("id", id)
    .maybeSingle();
  if (!count) notFound();

  const [{ data: loc }, { data: items }] = await Promise.all([
    supabase
      .from("locations")
      .select("name, timezone")
      .eq("id", count.location_id)
      .maybeSingle(),
    supabase
      .from("inventory_count_items")
      .select("id, barcode, sku, product_title, variant_title, qty, expected, unknown, updated_at")
      .eq("count_id", id)
      .order("updated_at", { ascending: false }),
  ]);
  const tz = loc?.timezone ?? "UTC";
  const startedAtLabel = formatInTimeZone(new Date(count.started_at), tz, "MMM d · HH:mm");
  const rows = items ?? [];

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link
          href="/admin/inventory"
          className="text-muted-foreground flex items-center gap-1 text-sm hover:underline"
        >
          <ChevronLeft className="size-4" /> Inventory
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {loc?.name ?? "Store"} · count
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Started {startedAtLabel}
          {count.note && ` · ${count.note}`}
        </p>
      </div>
      {count.status === "final" ? (
        <Badge variant="secondary">final</Badge>
      ) : (
        <Badge>counting</Badge>
      )}
    </div>
  );

  if (count.status === "open") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <CountScreen countId={count.id} initialItems={rows} />
      </div>
    );
  }

  // Finalized: the variance report.
  const countItems = rows as CountItem[];
  const t = countTotals(countItems);
  const report = varianceRows(countItems);
  const csv = buildInventoryCsv(
    {
      locationName: loc?.name ?? "Store",
      startedAt: startedAtLabel,
      status: "final",
    },
    countItems,
  );

  return (
    <div className="flex flex-col gap-6">
      {header}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Counted units" value={String(t.countedUnits)} />
        <Kpi label="Units in Shopify" value={String(t.expectedUnits)} />
        <Kpi
          label="Missing units"
          value={String(t.missingUnits)}
          tone={t.missingUnits > 0 ? "bad" : "good"}
        />
        <Kpi
          label="Over count"
          value={String(t.overUnits)}
          tone={t.overUnits > 0 ? "warn" : "good"}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {report.length} items · {t.unknownItems} unknown barcode
          {t.unknownItems === 1 ? "" : "s"}
        </p>
        <DownloadCsvButton
          csv={csv}
          filename={`inventory-${(loc?.name ?? "store").toLowerCase().replace(/\s+/g, "-")}-${count.started_at.slice(0, 10)}.csv`}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead className="text-right">In Shopify</TableHead>
                  <TableHead className="text-right">Diff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.map((r) => (
                  <TableRow key={r.barcode}>
                    <TableCell>
                      <span className="font-medium">{r.product_title}</span>
                      {r.variant_title && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {r.variant_title}
                        </span>
                      )}
                      {r.unknown && (
                        <Badge variant="outline" className="ml-2 text-amber-600">
                          unknown barcode
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden tabular-nums sm:table-cell">
                      {r.sku ?? r.barcode}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.qty}</TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {r.expected ?? "—"}
                    </TableCell>
                    <TableCell
                      className={
                        "text-right font-medium tabular-nums " +
                        (r.diff == null
                          ? "text-muted-foreground"
                          : r.diff < 0
                            ? "text-destructive"
                            : r.diff > 0
                              ? "text-amber-600"
                              : "text-emerald-600")
                      }
                    >
                      {r.diff == null ? "—" : r.diff > 0 ? `+${r.diff}` : r.diff}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <span className="text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </span>
        <span
          className={
            "text-2xl font-semibold tabular-nums " +
            (tone === "bad"
              ? "text-destructive"
              : tone === "warn"
                ? "text-amber-600"
                : "")
          }
        >
          {value}
        </span>
      </CardContent>
    </Card>
  );
}
