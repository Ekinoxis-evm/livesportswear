import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { accessibleLocationIds } from "@/lib/auth";
import { businessDate } from "@/lib/business-date";
import { resolveDateRange, spanDays } from "@/lib/date-range";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { customRangeInTz, normalizeStaffId } from "@/lib/shopify-range";
import { getStaffSalesCached, getShopSalesCached } from "@/lib/shopify-range-cache";
import { formatMoney } from "@/lib/commission";
import { shortDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangeForm } from "@/components/shared/date-range-form";

export default async function SalesRangePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerClient();

  const { data: locationRows } = await supabase
    .from("locations")
    .select("id, name, timezone")
    .eq("active", true)
    .order("name");
  const access = await accessibleLocationIds();
  const locations = (locationRows ?? []).filter(
    (l) => access === "all" || access.includes(l.id),
  );
  if (locations.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Sales range</h1>
        <p className="text-muted-foreground text-sm">No active stores.</p>
      </div>
    );
  }

  const location = locations.find((l) => l.id === sp.location) ?? locations[0];
  const today = businessDate(location.timezone);
  const { from, to } = resolveDateRange(sp, today);

  const { data: currencyRow } = await supabase
    .from("commission_config")
    .select("currency")
    .eq("id", 1)
    .maybeSingle();
  const currency = currencyRow?.currency ?? "USD";

  let rows: { name: string; amount: number }[] = [];
  let shopTotal: { total: number; orders: number } | null = null;
  let unmappedCount = 0;
  if (isShopifyConfigured()) {
    const range = customRangeInTz(from, to, location.timezone);
    const [entries, shop, { data: emps }, { count: unmapped }] = await Promise.all([
      getStaffSalesCached(range.start, range.endExclusive),
      getShopSalesCached(range.start, range.endExclusive),
      supabase
        .from("employees")
        .select("name, shopify_staff_id")
        .eq("location_id", location.id)
        .eq("active", true)
        .not("shopify_staff_id", "is", null),
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("location_id", location.id)
        .eq("active", true)
        .is("shopify_staff_id", null),
    ]);
    unmappedCount = unmapped ?? 0;
    if (entries) {
      const byStaff = new Map(entries);
      rows = (emps ?? [])
        .map((e) => ({
          name: e.name,
          amount: byStaff.get(normalizeStaffId(e.shopify_staff_id as string)) ?? 0,
        }))
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    }
    if (shop) shopTotal = { total: shop.total, orders: shop.orders };
  }
  const storeTotal = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales range</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Shopify sales between two dates, attributed per employee. Long ranges
          may take a few seconds.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {locations.map((l) => (
          <Link
            key={l.id}
            href={`/admin/sales?location=${l.id}&from=${from}&to=${to}`}
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

      <DateRangeForm
        from={from}
        to={to}
        action="/admin/sales"
        hidden={{ location: location.id }}
      />

      {!isShopifyConfigured() ? (
        <p className="text-muted-foreground text-sm">
          Shopify isn&apos;t connected yet — connect it in Settings to see sales.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardDescription>{location.name} · attributed</CardDescription>
                <CardTitle className="tabular-nums">
                  {formatMoney(storeTotal, currency)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Whole shop (all stores + web)</CardDescription>
                <CardTitle className="tabular-nums">
                  {shopTotal ? formatMoney(shopTotal.total, currency) : "—"}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Period</CardDescription>
                <CardTitle className="text-base tabular-nums">
                  {shortDate(from)} – {shortDate(to)} · {spanDays(from, to)}d
                  {shopTotal ? ` · ${shopTotal.orders} orders` : ""}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-center">
                      No mapped employees or Shopify unreachable.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r, i) => (
                  <TableRow key={r.name}>
                    <TableCell>
                      <span className="text-muted-foreground mr-2 tabular-nums">
                        {i + 1}.
                      </span>
                      {r.name}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(r.amount, currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {storeTotal > 0 ? `${Math.round((r.amount / storeTotal) * 100)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {unmappedCount > 0 && (
            <p className="text-muted-foreground text-xs">
              {unmappedCount} active employee{unmappedCount === 1 ? "" : "s"} at this
              store {unmappedCount === 1 ? "isn't" : "aren't"} mapped to a Shopify
              staff profile and {unmappedCount === 1 ? "doesn't" : "don't"} appear
              here — map them in Settings.
            </p>
          )}
        </>
      )}
    </div>
  );
}
