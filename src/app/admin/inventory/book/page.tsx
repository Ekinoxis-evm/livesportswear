import Link from "next/link";
import { ChevronLeft, Search, UploadCloud } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { formatInTimeZone } from "date-fns-tz";
import { buildBookCsv, type BookRow } from "@/lib/inventory-count";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DownloadCsvButton } from "@/components/inventory/download-csv-button";

const PAGE_SIZE = 200;

export default async function InventoryBookPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; q?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createServerClient();

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, timezone")
    .eq("active", true)
    .order("name");
  const locations = locationRows ?? [];
  if (locations.length === 0) {
    return <p className="text-muted-foreground text-sm">No active stores.</p>;
  }
  const location = locations.find((l) => l.id === sp.location) ?? locations[0];
  const q = (sp.q ?? "").trim();

  let query = supabase
    .from("store_inventory")
    .select(
      "barcode, sku, product_title, product_type, variant_title, qty, shopify_qty, unknown, counted_at",
      { count: "exact" },
    )
    .eq("location_id", location.id);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(
      `product_title.ilike.${like},sku.ilike.${like},barcode.ilike.${like}`,
    );
  }
  const { data: rows, count: totalRows } = await query
    .order("product_title")
    .order("variant_title")
    .limit(PAGE_SIZE);
  const shown = (rows ?? []) as BookRow[];

  // Totals over the WHOLE book (not just the shown page) — cheap aggregates.
  const { data: allQty } = await supabase
    .from("store_inventory")
    .select("qty, counted_at")
    .eq("location_id", location.id);
  const bookUnits = (allQty ?? []).reduce((a, r) => a + r.qty, 0);
  const lastCounted = (allQty ?? []).reduce<string | null>(
    (max, r) => (max === null || r.counted_at > max ? r.counted_at : max),
    null,
  );

  // CSV covers the full filtered set when small, else the whole book unfiltered.
  const { data: csvRows } = await supabase
    .from("store_inventory")
    .select("barcode, sku, product_title, product_type, variant_title, qty, shopify_qty, unknown, counted_at")
    .eq("location_id", location.id)
    .order("product_title")
    .order("variant_title");
  const csv = buildBookCsv(location.name, (csvRows ?? []) as BookRow[]);

  const href = (next: Partial<{ location: string; q: string }>) => {
    const p = new URLSearchParams({
      location: next.location ?? location.id,
      ...(next.q ?? q ? { q: next.q ?? q } : {}),
    });
    return `/admin/inventory/book?${p}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/inventory"
            className="text-muted-foreground flex items-center gap-1 text-sm hover:underline"
          >
            <ChevronLeft className="size-4" /> Inventory
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Inventory book · {location.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Our counted truth per barcode — replaced by each finalized count.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/inventory/push?location=${location.id}`}
            className="border-input hover:bg-muted flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium"
          >
            <UploadCloud className="size-4" /> Push to Shopify
          </Link>
          <DownloadCsvButton
            csv={csv}
            filename={`inventory-book-${location.name.toLowerCase().replace(/\s+/g, "-")}.csv`}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="font-semibold tabular-nums">{totalRows ?? 0}</span>{" "}
          <span className="text-muted-foreground">items</span>
        </span>
        <span>
          <span className="font-semibold tabular-nums">{bookUnits}</span>{" "}
          <span className="text-muted-foreground">units on hand</span>
        </span>
        {lastCounted && (
          <span className="text-muted-foreground">
            last count{" "}
            {formatInTimeZone(new Date(lastCounted), location.timezone, "MMM d · HH:mm")}
          </span>
        )}
      </div>

      {locations.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {locations.map((l) => (
            <Link
              key={l.id}
              href={href({ location: l.id })}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                l.id === location.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted",
              )}
            >
              {l.name}
            </Link>
          ))}
        </div>
      )}

      <form method="GET" action="/admin/inventory/book" className="relative max-w-sm">
        <input type="hidden" name="location" value={location.id} />
        <Search className="text-muted-foreground absolute left-2.5 top-2.5 size-4" />
        <Input
          name="q"
          defaultValue={q}
          className="pl-8"
          placeholder="Search product, SKU, or barcode…"
        />
      </form>

      <Card>
        <CardContent className="pt-6">
          {shown.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {q
                ? "No items match the search."
                : "The book is empty — finalize an inventory count to build it."}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="hidden sm:table-cell">SKU</TableHead>
                      <TableHead className="hidden md:table-cell">Barcode</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">
                        Shopify at count
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((r) => (
                      <TableRow key={r.barcode}>
                        <TableCell>
                          <span className="font-medium">{r.product_title}</span>
                          {r.variant_title && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              {r.variant_title}
                            </span>
                          )}
                          {r.product_type && (
                            <span className="text-muted-foreground ml-2 text-[10px] uppercase tracking-wide">
                              {r.product_type}
                            </span>
                          )}
                          {r.unknown && (
                            <Badge variant="outline" className="ml-2 text-amber-600">
                              unknown barcode
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden tabular-nums sm:table-cell">
                          {r.sku ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden tabular-nums md:table-cell">
                          {r.barcode}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {r.qty}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                          {r.shopify_qty ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {(totalRows ?? 0) > shown.length && (
                <p className="text-muted-foreground mt-3 text-xs">
                  Showing {shown.length} of {totalRows} items — refine the search
                  or use the CSV for the full book.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
