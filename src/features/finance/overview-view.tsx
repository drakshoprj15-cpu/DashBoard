"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CreditCard,
  Receipt,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
} from "@/features/dashboard/period";
import type { FinanceOverview } from "@/features/finance/overview-queries";
import { cn } from "@/lib/utils";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const SHORTCUTS = [
  {
    href: "/financeiro/processador",
    label: "Processador",
    icon: CreditCard,
    description: "Gateway de pagamento",
  },
  {
    href: "/financeiro/entradas-saidas",
    label: "Entradas e Saídas",
    icon: Receipt,
    description: "Livro-caixa completo",
  },
  {
    href: "/financeiro/repasses",
    label: "Repasses",
    icon: Banknote,
    description: "Saldo repassado e previsto",
  },
  {
    href: "/pedidos",
    label: "Pedidos",
    icon: ShoppingBag,
    description: "Vendas registadas",
  },
];

export function OverviewView() {
  const [period, setPeriod] = React.useState<DashboardPeriod>("30d");
  const [data, setData] = React.useState<FinanceOverview | null>(null);
  const [status, setStatus] = React.useState<
    "loading" | "success" | "error" | "empty"
  >("loading");

  React.useEffect(() => {
    let active = true;

    async function fetchData() {
      if (active) setStatus("loading");
      try {
        const res = await fetch(`/api/finance/overview?period=${period}`, {
          cache: "no-store",
        });
        if (!active) return;
        if (res.status === 503) {
          setData(null);
          setStatus("empty");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as FinanceOverview;
        if (!active) return;
        setData(json);
        setStatus("success");
      } catch {
        if (active) setStatus("error");
      }
    }

    fetchData();
    return () => {
      active = false;
    };
  }, [period]);

  const currency = data?.currency ?? "EUR";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Selecionar período"
          className="border-border bg-card inline-flex items-center gap-0.5 rounded-lg border p-0.5"
        >
          {DASHBOARD_PERIODS.map((p) => (
            <Button
              key={p.value}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "h-7 px-2.5 text-xs font-medium",
                period === p.value
                  ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {status === "loading" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[96px]" />
            ))}
          </div>
          <Skeleton className="h-[320px]" />
        </div>
      )}

      {status === "error" && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            Não foi possível carregar a visão geral. Tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {status === "empty" && (
        <Alert>
          <AlertCircle />
          <AlertDescription>
            Configure o Supabase para acompanhar as finanças da operação.
          </AlertDescription>
        </Alert>
      )}

      {status === "success" && data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Wallet className="size-3.5" aria-hidden="true" />
                  Saldo do período
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p
                  className={cn(
                    "text-2xl font-bold tracking-tight",
                    data.summary.balanceCents < 0 && "text-destructive",
                  )}
                >
                  {formatMoney(data.summary.balanceCents, currency, "pt-PT")}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <TrendingUp className="size-3.5" aria-hidden="true" />
                  Entradas
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-success text-2xl font-bold tracking-tight">
                  {formatMoney(data.summary.inflowCents, currency, "pt-PT")}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <TrendingDown className="size-3.5" aria-hidden="true" />
                  Saídas
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-destructive text-2xl font-bold tracking-tight">
                  {formatMoney(data.summary.outflowCents, currency, "pt-PT")}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Banknote className="size-3.5" aria-hidden="true" />
                  Próximo repasse
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-2xl font-bold tracking-tight">
                  {data.nextPayout
                    ? formatMoney(
                        data.nextPayout.amountCents,
                        currency,
                        "pt-PT",
                      )
                    : "—"}
                </p>
                {data.nextPayout?.expectedArrivalAt && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatDateTime(data.nextPayout.expectedArrivalAt, "pt-PT")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-xs">
                  Pedidos pagos no período
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-lg font-bold tracking-tight">
                  {formatNumber(data.paidOrdersCount)}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-xs">
                  Pedidos pendentes
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-lg font-bold tracking-tight">
                  {formatNumber(data.pendingOrdersCount)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entradas vs. Saídas</CardTitle>
              <CardDescription>
                Movimentação do livro-caixa no período
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.chartSeries.length === 0 ? (
                <div className="text-muted-foreground flex h-[280px] items-center justify-center text-sm">
                  Sem dados no período
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={data.chartSeries}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{
                        fill: "var(--color-muted-foreground)",
                        fontSize: 12,
                      }}
                      minTickGap={24}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={76}
                      tick={{
                        fill: "var(--color-muted-foreground)",
                        fontSize: 12,
                      }}
                      tickFormatter={(v: number) =>
                        formatMoney(v, currency, "pt-PT")
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
                        formatMoney(Number(value), currency, "pt-PT"),
                        name === "inflowCents" ? "Entradas" : "Saídas",
                      ]}
                    />
                    <Bar
                      dataKey="inflowCents"
                      fill="var(--color-success)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="outflowCents"
                      fill="var(--color-destructive)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SHORTCUTS.map((s) => {
              const Icon = s.icon;
              return (
                <Link key={s.href} href={s.href}>
                  <Card className="hover:border-primary/40 h-full gap-2 py-4 transition-colors">
                    <CardContent className="flex items-center gap-3 px-4">
                      <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                        <Icon className="size-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {s.label}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {s.description}
                        </p>
                      </div>
                      <ArrowRight
                        className="text-muted-foreground size-4 shrink-0"
                        aria-hidden="true"
                      />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
