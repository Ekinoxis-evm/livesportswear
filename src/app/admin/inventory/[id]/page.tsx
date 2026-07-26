import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ArrowRight } from "lucide-react";
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
  ReceivedLinesTable,
  VarianceReportTable,
} from "@/components/inventory/count-report-tables";
import { CountScreen } from "@/components/inventory/count-screen";
import { ReceiveScreen, type ReceiveItem } from "@/components/inventory/receive-screen";
import { receivingRows } from "@/lib/receiving";
import { InventoryFunnel } from "@/components/inventory/inventory-funnel";
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
    .select("id, location_id, status, kind, note, started_at, finalized_at")
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
      .select("id, barcode, sku, product_title, product_type, variant_title, qty, expected, doc_qty, hs_code, verified, unknown, updated_at")
      .eq("count_id", id)
      .order("updated_at", { ascending: false }),
  ]);
  const tz = loc?.timezone ?? "UTC";
  const startedAtLabel = formatInTimeZone(new Date(count.started_at), tz, "MMM d · HH:mm");
  const rows = items ?? [];
  const isRestock = count.kind === "restock";

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
          {loc?.name ?? "Store"} · {isRestock ? "new stock" : "count"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Started {startedAtLabel}
          {count.note && ` · ${count.note}`}
        </p>
      </div>
      {count.status === "final" ? (
        <Badge variant="secondary">{isRestock ? "received" : "final"}</Badge>
      ) : (
        <Badge>{isRestock ? "receiving" : "counting"}</Badge>
      )}
    </div>
  );

  const funnel = <InventoryFunnel current="count" locationId={count.location_id} />;

  // Finalized → the next step is the book, then Shopify. Make that a click, not a hunt.
  const toBook = (
    <Link
      href={`/admin/inventory/book?location=${count.location_id}`}
      className="bg-primary text-primary-foreground hover:opacity-90 inline-flex h-10 items-center gap-2 self-start rounded-md px-4 text-sm font-medium"
    >
      Go to inventory book <ArrowRight className="size-4" />
    </Link>
  );

  if (isRestock) {
    const receiveItems: ReceiveItem[] = rows.map((r) => ({
      id: r.id,
      barcode: r.barcode,
      sku: r.sku,
      product_title: r.product_title,
      variant_title: r.variant_title,
      expected: r.expected,
      doc_qty: r.doc_qty,
      qty: r.qty,
      hs_code: r.hs_code,
      verified: r.verified,
      unknown: r.unknown,
    }));

    if (count.status === "open") {
      return (
        <div className="flex flex-col gap-6">
          {header}
          {funnel}
          <ReceiveScreen countId={count.id} items={receiveItems} />
        </div>
      );
    }

    // Received: a read-only summary of the merge that was written.
    const rr = receivingRows(receiveItems);
    const arrived = rr.reduce((s, r) => s + r.qty, 0);
    return (
      <div className="flex flex-col gap-6">
        {header}
        {funnel}
        {toBook}
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi label="Lines received" value={String(rr.filter((r) => !r.unknown).length)} />
          <Kpi label="Units added" value={String(arrived)} />
          <Kpi label="Skipped (unmatched)" value={String(rr.filter((r) => r.unknown).length)} />
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <ReceivedLinesTable rows={rr} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (count.status === "open") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {funnel}
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
      {funnel}
      {toBook}

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
            <VarianceReportTable rows={report} />
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
