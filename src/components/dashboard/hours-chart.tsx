"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function HoursChart({ data }: { data: { name: string; hours: number }[] }) {
  if (data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No shifts scheduled this week.</p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
      >
        <XAxis type="number" tick={{ fontSize: 12 }} stroke="currentColor" />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fontSize: 12 }}
          stroke="currentColor"
        />
        <Tooltip
          cursor={{ fill: "color-mix(in oklab, currentColor 10%, transparent)" }}
        />
        <Bar dataKey="hours" name="Hours" radius={4} fill="#71717a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
