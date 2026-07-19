import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { accessibleLocationIds } from "@/lib/auth";
import { businessDate } from "@/lib/business-date";
import { primaryTimezone } from "@/lib/business-tz";
import { resolveDateRange, spanDays } from "@/lib/date-range";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { customRangeInTz, normalizeStaffId } from "@/lib/shopify-range";
import { getStaffSalesCached, getShopSalesCached } from "@/lib/shopify-range-cache";
import {
  commissionFor,
  formatMoney,
  asTiers,
  resolveTiers,
  type CommissionTier,
} from "@/lib/commission";
import { repMonthlyData } from "@/lib/monthly-series";
import { monthLabel, shortDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateRangeForm } from "@/components/shared/date-range-form";
import { SalesBreakdownBlock } from "@/components/shared/sales-breakdown-view";
import { sumBreakdowns, zeroBreakdown, type SalesBreakdown } from "@/lib/sales-breakdown";
import { SyncSalesButton } from "@/components/commission/sync-sales-button";
import { RepSalesChart } from "@/components/dashboard/sales-charts";

export default async function SalesTabPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; from?: string; to?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createServerClient();
  const today = businessDate(await primaryTimezone());
  const month = today.slice(0, 7);
  const currentYear = Number(today.slice(0, 4));
  const monthNum = Number(today.slice(5, 7));
  const chartYear =
    sp.year && /^\d{4}$/.test(sp.year)
      ? Math.min(Math.max(Number(sp.year), 2024), currentYear)
      : currentYear;

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
    return <p className="text-muted-foreground text-sm">No active stores.</p>;
  }
  const location = locations.find((l) => l.id === sp.location) ?? locations[0];
  const { from, to } = resolveDateRange(sp, today);

  // Every internal link keeps the other filters alive.
  const qs = (next: Partial<{ location: string; from: string; to: string; year: number }>) => {
    const p = new URLSearchParams({
      location: next.location ?? location.id,
      from: next.from ?? from,
      to: next.to ?? to,
      year: String(next.year ?? chartYear),
    });
    return `/admin/performance/sales?${p}`;
  };

  const [
    { data: config },
    { data: goalRows },
    { data: employees },
    { data: monthSales },
    { data: yearSales },
  ] = await Promise.all([
    supabase.from("commission_config").select("currency, tiers").eq("id", 1).maybeSingle(),
    supabase
      .from("store_goals")
      .select("location_id, year, month, tiers")
      .eq("year", currentYear)
      .eq("month", monthNum),
    // No active filter: former reps with history belong in past charts;
    // the series builder only includes employees with sales in the year.
    supabase
      .from("employees")
      .select("id, name, location_id, avatar_color, active, shopify_staff_id, locations(name)")
      .order("name"),
    supabase
      .from("monthly_sales")
      .select("employee_id, amount, gross_amount, discounts_amount, returns_amount")
      .eq("month", month),
    supabase
      .from("monthly_sales")
      .select("employee_id, month, amount")
      .like("month", `${chartYear}-%`),
  ]);
  const currency = config?.currency ?? "USD";
  const globalTiers = asTiers(config?.tiers);
  const monthTiersByLoc: Record<string, CommissionTier[]> = {};
  for (const g of goalRows ?? []) {
    monthTiersByLoc[g.location_id] = resolveTiers(g.tiers, globalTiers);
  }
  const allEmployees = employees ?? [];

  const salesBy = new Map((monthSales ?? []).map((s) => [s.employee_id, s]));
  const ranking = allEmployees
    .filter((e) => e.active)
    .map((e) => {
      const row = salesBy.get(e.id);
      const amount = Number(row?.amount ?? 0);
      // History synced before the breakdown columns existed has them null.
      const breakdown: SalesBreakdown | null =
        row?.gross_amount != null
          ? {
              gross: Number(row.gross_amount),
              discounts: Number(row.discounts_amount ?? 0),
              returns: Number(row.returns_amount ?? 0),
              net: amount,
            }
          : null;
      const tiers = monthTiersByLoc[e.location_id] ?? globalTiers;
      return {
        id: e.id,
        name: e.name,
        store: (e.locations as { name: string } | null)?.name ?? "—",
        amount,
        breakdown,
        ...commissionFor(amount, tiers),
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const { series: repSeries, data: repData } = repMonthlyData(
    (yearSales ?? []).map((r) => ({
      employee_id: r.employee_id,
      month: r.month,
      amount: Number(r.amount),
    })),
    chartYear,
    allEmployees,
    chartYear === currentYear ? monthNum : 12,
  );

  // Range view (live Shopify).
  let rangeRows: { name: string; sales: SalesBreakdown }[] = [];
  let shopTotal: (SalesBreakdown & { orders: number }) | null = null;
  let unmappedCount = 0;
  if (isShopifyConfigured()) {
    const range = customRangeInTz(from, to, location.timezone);
    const [entries, shop] = await Promise.all([
      getStaffSalesCached(range.start, range.endExclusive),
      getShopSalesCached(range.start, range.endExclusive),
    ]);
    const mapped = allEmployees.filter(
      (e) => e.location_id === location.id && e.active && e.shopify_staff_id,
    );
    unmappedCount = allEmployees.filter(
      (e) => e.location_id === location.id && e.active && !e.shopify_staff_id,
    ).length;
    if (entries) {
      const byStaff = new Map(entries);
      rangeRows = mapped
        .map((e) => ({
          name: e.name,
          sales:
            byStaff.get(normalizeStaffId(e.shopify_staff_id as string)) ??
            zeroBreakdown(),
        }))
        .sort((a, b) => b.sales.net - a.sales.net || a.name.localeCompare(b.name));
    }
    if (shop) shopTotal = { ...shop, orders: shop.orders };
  }
  const rangeTotal = sumBreakdowns(rangeRows.map((r) => r.sales));

  return (
    <div className="flex flex-col gap-6">
      {/* Ranking · this month */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Ranking · {monthLabel(month)}</CardTitle>
              <CardDescription>
                By sales this month — rate uses each rep&apos;s store tiers.
              </CardDescription>
            </div>
            <SyncSalesButton />
          </div>
        </CardHeader>
        <CardContent>
          {ranking.length === 0 ? (
            <p className="text-muted-foreground text-sm">No active employees.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden sm:table-cell">Store</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Value</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Discounts</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Returns</TableHead>
                  <TableHead className="text-right">Net sales</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">To next tier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map((r, i) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {r.store}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                      {r.breakdown ? formatMoney(r.breakdown.gross, currency) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                      {r.breakdown && r.breakdown.discounts > 0
                        ? `−${formatMoney(r.breakdown.discounts, currency)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                      {r.breakdown && r.breakdown.returns > 0
                        ? `−${formatMoney(r.breakdown.returns, currency)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(r.amount, currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{(r.rate * 100).toFixed(1)}%</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(r.earned, currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">
                      {r.nextTier
                        ? `${formatMoney(r.nextTier.remaining, currency)} → ${(r.nextTier.rate * 100).toFixed(1)}%`
                        : "Top tier"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Rep chart · year */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide">
          Sales by rep · {chartYear}
        </h2>
        <div className="flex items-center gap-1">
          <Link
            href={qs({ year: chartYear - 1 })}
            aria-label="Previous year"
            className="hover:bg-muted rounded-md border p-1.5"
          >
            <ChevronLeft className="size-4" />
          </Link>
          {chartYear !== currentYear && (
            <Link
              href={qs({ year: currentYear })}
              className="px-1 text-sm underline-offset-4 hover:underline"
            >
              This year
            </Link>
          )}
          {chartYear < currentYear && (
            <Link
              href={qs({ year: chartYear + 1 })}
              aria-label="Next year"
              className="hover:bg-muted rounded-md border p-1.5"
            >
              <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
      <RepSalesChart year={chartYear} currency={currency} series={repSeries} data={repData} />

      {/* Custom range · live Shopify */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide">Custom range</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Net Shopify sales between two dates, attributed per employee. Long
          ranges may take a few seconds.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {locations.map((l) => (
          <Link
            key={l.id}
            href={qs({ location: l.id })}
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
        action="/admin/performance/sales"
        hidden={{ location: location.id, year: String(chartYear) }}
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
              </CardHeader>
              <CardContent>
                <SalesBreakdownBlock sales={rangeTotal} currency={currency} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>Whole shop (all stores + web)</CardDescription>
              </CardHeader>
              <CardContent>
                {shopTotal ? (
                  <SalesBreakdownBlock sales={shopTotal} currency={currency} />
                ) : (
                  <p className="text-muted-foreground text-sm">—</p>
                )}
              </CardContent>
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
                  <TableHead className="hidden text-right sm:table-cell">Value</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Discounts</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Returns</TableHead>
                  <TableHead className="text-right">Net sales</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rangeRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground text-center">
                      No mapped employees or Shopify unreachable.
                    </TableCell>
                  </TableRow>
                )}
                {rangeRows.map((r, i) => (
                  <TableRow key={r.name}>
                    <TableCell>
                      <span className="text-muted-foreground mr-2 tabular-nums">
                        {i + 1}.
                      </span>
                      {r.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                      {formatMoney(r.sales.gross, currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                      {r.sales.discounts > 0
                        ? `−${formatMoney(r.sales.discounts, currency)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right tabular-nums sm:table-cell">
                      {r.sales.returns > 0
                        ? `−${formatMoney(r.sales.returns, currency)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(r.sales.net, currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {rangeTotal.net > 0
                        ? `${Math.round((r.sales.net / rangeTotal.net) * 100)}%`
                        : "—"}
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
              staff profile and {unmappedCount === 1 ? "doesn't" : "don't"} appear in
              the range table — map them in Settings.
            </p>
          )}
        </>
      )}
    </div>
  );
}
