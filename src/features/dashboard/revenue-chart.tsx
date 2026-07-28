"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface RevenueChartProps {
  data: { day: string; aprovada: number; pendente: number }[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fillAprovada" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-chart-3)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-chart-3)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="fillPendente" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-chart-4)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-chart-4)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={70}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
          tickFormatter={(v: number) =>
            v.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
              maximumFractionDigits: 0,
            })
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
          formatter={(value, name) => [
            Number(value).toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            }),
            name === "aprovada" ? "Aprovada" : "Pendente",
          ]}
        />
        <Area
          type="monotone"
          dataKey="aprovada"
          stroke="var(--color-chart-3)"
          strokeWidth={2}
          fill="url(#fillAprovada)"
        />
        <Area
          type="monotone"
          dataKey="pendente"
          stroke="var(--color-chart-4)"
          strokeWidth={2}
          fill="url(#fillPendente)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
