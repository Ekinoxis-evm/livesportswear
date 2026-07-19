import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createServerClient } from "@/lib/supabase/server";
import { accessibleLocationIds } from "@/lib/auth";
import { businessDate } from "@/lib/business-date";
import { spanDays } from "@/lib/date-range";
import { isShopifyConfigured } from "@/lib/shopify-config";
import { customRangeInTz } from "@/lib/shopify-range";
import { getStaffSalesCached, getShopSalesCached } from "@/lib/shopify-range-cache";
import { repMonthlyData } from "@/lib/monthly-series";
import { shortDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SalesBreakdownBlock } from "@/components/shared/sales-breakdown-view";
import { sumBreakdowns, type SalesBreakdown } from "@/lib/sales-breakdown";
import {
  monthRows,
  periodBounds,
  resolveSalesPeriod,
  staffRowsFromEntries,
  type SalesRankRow,
} from "@/lib/sales-period";
import { PeriodPills } from "@/components/shared/period-pills";
import { SalesRankTable } from "@/components/shared/sales-rank-table";
import { RepSalesChart } from "@/components/dashboard/sales-charts";

export default async function SalesTabPage({
  searchParams,
}: {
  searchParams: Promise<{
    location?: string;
    from?: string;
    to?: string;
    year?: string;
    period?: string;
  }>;
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
    return <p className="text-muted-foreground text-sm">No active stores.</p>;
  }
  const location = locations.find((l) => l.id === sp.location) ?? locations[0];
  // "Today" means the BROWSED store's business day — never another store's tz.
  const today = businessDate(location.timezone);
  const currentYear = Number(today.slice(0, 4));
  const monthNum = Number(today.slice(5, 7));
  const chartYear =
    sp.year && /^\d{4}$/.test(sp.year)
      ? Math.min(Math.max(Number(sp.year), 2024), currentYear)
      : currentYear;
  const { mode, from, to } = resolveSalesPeriod(sp, today);

  // Every internal link keeps the other filters alive.
  const qs = (next: Partial<{ location: string; year: number }>) => {
    const p = new URLSearchParams({
      location: next.location ?? location.id,
      year: String(next.year ?? chartYear),
    });
    if (mode === "custom") {
      p.set("from", from);
      p.set("to", to);
    } else if (mode !== "today") {
      p.set("period", mode);
    }
    return `/admin/performance/sales?${p}`;
  };

  const [{ data: config }, { data: employees }, { data: yearSales }] =
    await Promise.all([
      supabase.from("commission_config").select("currency").eq("id", 1).maybeSingle(),
      // No active filter: former reps with history belong in past charts;
      // the series builder only includes employees with sales in the year.
      supabase
        .from("employees")
        .select("id, name, location_id, avatar_color, active, shopify_staff_id")
        .order("name"),
      supabase
        .from("monthly_sales")
        .select("employee_id, month, amount")
        .like("month", `${chartYear}-%`),
    ]);
  const currency = config?.currency ?? "USD";
  const allEmployees = employees ?? [];

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

  // The standard sales-period module: month reads the synced DB; the live
  // periods (today/week/custom) pull attributed Shopify sales.
  const locActive = allEmployees.filter(
    (e) => e.location_id === location.id && e.active,
  );
  const bounds = periodBounds(mode, { today, from, to });
  let rankRows: SalesRankRow[] = [];
  let shopTotal: (SalesBreakdown & { orders: number }) | null = null;
  const unmappedCount = locActive.filter((e) => !e.shopify_staff_id).length;
  if (mode === "month") {
    const { data: monthSalesRows } = await supabase
      .from("monthly_sales")
      .select("employee_id, amount, gross_amount, discounts_amount, returns_amount")
      .eq("month", today.slice(0, 7));
    rankRows = monthRows(monthSalesRows ?? [], locActive, { keepZeros: true });
  } else if (isShopifyConfigured()) {
    const range = customRangeInTz(bounds.from, bounds.to, location.timezone);
    const [entries, shop] = await Promise.all([
      getStaffSalesCached(range.start, range.endExclusive),
      getShopSalesCached(range.start, range.endExclusive),
    ]);
    if (entries) rankRows = staffRowsFromEntries(entries, locActive);
    if (shop) shopTotal = { ...shop, orders: shop.orders };
  }
  const rangeTotal = sumBreakdowns(
    rankRows.map((r) => r.breakdown).filter((b): b is SalesBreakdown => b !== null),
  );
  for (const r of rankRows) {
    r.sharePct = rangeTotal.net > 0 ? r.net / rangeTotal.net : null;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The standard sales-period module */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide">Sales</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Net sales attributed per employee — Today, Week, Month, or custom
          dates. Long custom ranges may take a few seconds.
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

      <PeriodPills
        basePath="/admin/performance/sales"
        mode={mode}
        from={from}
        to={to}
        hidden={{ location: location.id, year: String(chartYear) }}
      />

      {!isShopifyConfigured() && mode !== "month" ? (
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
            {mode !== "month" && (
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
            )}
            <Card>
              <CardHeader>
                <CardDescription>Period</CardDescription>
                <CardTitle className="text-base tabular-nums">
                  {shortDate(bounds.from)} – {shortDate(bounds.to)} ·{" "}
                  {spanDays(bounds.from, bounds.to)}d
                  {mode !== "month" && shopTotal ? ` · ${shopTotal.orders} orders` : ""}
                  {mode === "month" ? " · synced" : ""}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <SalesRankTable rows={rankRows} currency={currency} showShare />
            </CardContent>
          </Card>

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
    </div>
  );
}
