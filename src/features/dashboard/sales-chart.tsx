"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ChartPoint } from "@/features/dashboard/queries";

export interface SalesChartProps {
  data: ChartPoint[];
  currency: string;
}

type Metric = "revenue" | "orders";

export function SalesChart({ data, currency }: SalesChartProps) {
  const [metric, setMetric] = React.useState<Metric>("revenue");

  const chartData = data.map((p) => ({
    label: p.label,
    value: metric === "revenue" ? p.revenueCents / 100 : p.orders,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {(
          [
            { key: "revenue", label: "Faturamento" },
            { key: "orders", label: "Pedidos" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setMetric(opt.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              metric === opt.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {data.length === 0 ? (
        <div className="text-muted-foreground flex h-[280px] items-center justify-center text-sm">
          Sem dados no período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={metric === "revenue" ? 76 : 40}
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
              tickFormatter={(v: number) =>
                metric === "revenue"
                  ? formatMoney(Math.round(v * 100), currency, "pt-PT")
                  : formatNumber(v)
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                color: "var(--color-popover-foreground)",
                fontSize: 13,
              }}
              formatter={(value) => [
                metric === "revenue"
                  ? formatMoney(Math.round(Number(value) * 100), currency, "pt-PT")
                  : formatNumber(Number(value)),
                metric === "revenue" ? "Faturamento" : "Pedidos",
              ]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={2}
              fill="url(#fillSales)"
              isAnimationActive
              animationDuration={400}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
