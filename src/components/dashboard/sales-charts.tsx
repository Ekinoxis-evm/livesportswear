"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/commission";
import type { RepSeriesMeta } from "@/lib/monthly-series";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const FALLBACK = [1, 2, 3, 4, 5].map((n) => `var(--chart-${n})`);

function compact(v: number): string {
  return v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
}

export function SalesCharts({
  year,
  currency,
  series,
  repData,
  storeData,
}: {
  year: number;
  currency: string;
  series: RepSeriesMeta[];
  repData: Record<string, number | string | null>[];
  storeData: { month: string; total: number | null; goal: number | null }[];
}) {
  const empty = storeData.every((m) => (m.total ?? 0) === 0);
  if (empty) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          No sales synced for {year}.
        </CardContent>
      </Card>
    );
  }

  const colorOf = (s: RepSeriesMeta, i: number) =>
    s.color ?? FALLBACK[i % FALLBACK.length];

  const repConfig: ChartConfig = Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.name, color: colorOf(s, i) }]),
  );
  const storeConfig: ChartConfig = {
    total: { label: "Sales", color: "var(--chart-1)" },
    goal: { label: "Goal", color: "var(--muted-foreground)" },
  };
  const hasGoal = storeData.some((m) => m.goal !== null && m.goal > 0);
  const money = (v: unknown) => formatMoney(Number(v) || 0, currency);

  // Replaces the default tooltip row wholesale (that's the formatter contract),
  // so it re-renders the swatch + name alongside the money-formatted value.
  const moneyRow = (
    value: unknown,
    name: unknown,
    item: { color?: string },
  ) => (
    <>
      <div
        className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: item.color }}
      />
      <div className="flex flex-1 items-center justify-between gap-3 leading-none">
        <span className="text-muted-foreground">{String(name)}</span>
        <span className="text-foreground font-medium tabular-nums">
          {money(value)}
        </span>
      </div>
    </>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales by rep · {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={repConfig} className="h-64 w-full">
            <LineChart data={repData} margin={{ top: 8, right: 12, left: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                tickFormatter={compact}
                className="tabular-nums"
              />
              <ChartTooltip content={<ChartTooltipContent formatter={moneyRow} />} />
              <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  type="monotone"
                  stroke={colorOf(s, i)}
                  strokeWidth={2}
                  strokeLinecap="round"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                />
              ))}
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Store sales · {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={storeConfig} className="h-64 w-full">
            <LineChart data={storeData} margin={{ top: 8, right: 12, left: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis
                width={44}
                tickLine={false}
                axisLine={false}
                tickFormatter={compact}
                className="tabular-nums"
              />
              <ChartTooltip content={<ChartTooltipContent formatter={moneyRow} />} />
              {hasGoal && <ChartLegend content={<ChartLegendContent className="flex-wrap" />} />}
              <Line
                dataKey="total"
                name="Sales"
                type="monotone"
                stroke="var(--chart-1)"
                strokeWidth={2}
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              />
              {hasGoal && (
                <Line
                  dataKey="goal"
                  name="Goal"
                  type="monotone"
                  stroke="var(--muted-foreground)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                />
              )}
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
