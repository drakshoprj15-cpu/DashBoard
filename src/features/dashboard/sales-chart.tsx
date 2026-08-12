"use client";

import * as React from "react";
import { BarChart3 } from "lucide-react";
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

interface ChartDatum {
  label: string;
  revenue: number;
  orders: number;
}

interface SalesTooltipProps {
  active?: boolean;
  point?: ChartDatum;
  label?: string | number;
  currency: string;
}

function SalesTooltip({ active, point, label, currency }: SalesTooltipProps) {
  if (!active || !point) return null;

  return (
    <div className="min-w-44 rounded-lg border border-fuchsia-300/15 bg-[#1a121c] px-4 py-3 shadow-[0_18px_45px_rgba(15,0,12,0.5)]">
      <p className="mb-3 text-xs font-semibold text-[#dce3ee]">{label}</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-6 text-xs">
          <span className="flex items-center gap-2 text-[#8d98a8]">
            <span
              className="size-1.5 rounded-full bg-fuchsia-400"
              aria-hidden="true"
            />
            Receita
          </span>
          <span className="font-semibold text-[#f6f8fc]">
            {formatMoney(Math.round(point.revenue * 100), currency, "pt-BR")}
          </span>
        </div>
        <div className="flex items-center justify-between gap-6 text-xs">
          <span className="flex items-center gap-2 text-[#8d98a8]">
            <span
              className="size-1.5 rounded-full bg-emerald-400"
              aria-hidden="true"
            />
            Pedidos
          </span>
          <span className="font-semibold text-[#f6f8fc]">
            {formatNumber(point.orders)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function SalesChart({ data, currency }: SalesChartProps) {
  const [metric, setMetric] = React.useState<Metric>("revenue");
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReduceMotion(media.matches);
    syncPreference();
    media.addEventListener("change", syncPreference);
    return () => media.removeEventListener("change", syncPreference);
  }, []);

  const chartData = React.useMemo<ChartDatum[]>(
    () =>
      data.map((point) => ({
        label: point.label,
        revenue: point.revenueCents / 100,
        orders: point.orders,
      })),
    [data],
  );

  return (
    <div className="space-y-5">
      <div
        role="group"
        aria-label="Métrica do gráfico"
        className="inline-flex h-8 items-center rounded-md border border-white/[0.08] bg-white/[0.03] p-0.5"
      >
        {(
          [
            { key: "revenue", label: "Receita" },
            { key: "orders", label: "Pedidos" },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={metric === option.key}
            onClick={() => setMetric(option.key)}
            className={cn(
              "h-7 rounded-sm px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50",
              metric === option.key
                ? "bg-[#e91e8f] text-white shadow-[0_5px_16px_rgba(233,30,143,0.25)]"
                : "text-[#8d98a8] hover:text-[#edf2f8]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {data.length === 0 ? (
        <div className="flex h-[300px] flex-col items-center justify-center text-center sm:h-[320px]">
          <span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-[#758195]">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-[#c3cbd7]">
            Nenhuma venda encontrada neste período.
          </p>
          <p className="mt-1 text-xs text-[#758195]">
            O gráfico será atualizado quando novas vendas forem registradas.
          </p>
        </div>
      ) : (
        <div className="h-[300px] w-full sm:h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="dashboardSalesFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#e91e8f" stopOpacity={0.3} />
                  <stop offset="90%" stopColor="#a21caf" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="4 6"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#748094", fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis
                dataKey={metric}
                tickLine={false}
                axisLine={false}
                width={metric === "revenue" ? 72 : 36}
                tick={{ fill: "#748094", fontSize: 11 }}
                tickFormatter={(value: number) =>
                  metric === "revenue"
                    ? new Intl.NumberFormat("pt-BR", {
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format(value)
                    : formatNumber(value)
                }
              />
              <Tooltip
                cursor={{ stroke: "rgba(244,114,182,0.36)", strokeWidth: 1 }}
                content={(props) => {
                  const point = props.payload?.[0]?.payload as
                    ChartDatum | undefined;
                  return (
                    <SalesTooltip
                      active={props.active}
                      point={point}
                      label={props.label}
                      currency={currency}
                    />
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke="#f472b6"
                strokeWidth={2.5}
                fill="url(#dashboardSalesFill)"
                activeDot={{
                  r: 4,
                  fill: "#f472b6",
                  stroke: "#141019",
                  strokeWidth: 2,
                }}
                isAnimationActive={!reduceMotion}
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
