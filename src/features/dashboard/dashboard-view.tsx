"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CreditCard,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import {
  isDashboardPeriod,
  type DashboardPeriod,
} from "@/features/dashboard/period";
import type { DashboardSnapshot } from "@/features/dashboard/queries";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { PeriodSelector } from "@/features/dashboard/period-selector";
import { MetricCard } from "@/features/dashboard/metric-card";
import { SalesChart } from "@/features/dashboard/sales-chart";
import { TopProducts } from "@/features/dashboard/top-products";
import { RecentOrders } from "@/features/dashboard/recent-orders";
import { SalesFunnel } from "@/features/dashboard/sales-funnel";
import { PaymentMethods } from "@/features/dashboard/payment-methods";
import { OperationalAlerts } from "@/features/dashboard/operational-alerts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function timeAgoShort(iso: string): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSeconds < 10) return "agora mesmo";
  if (diffSeconds < 60) return `há ${diffSeconds}s`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `há ${minutes}min`;
  return `há ${Math.floor(minutes / 60)}h`;
}

export function DashboardView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get("period");
  const period: DashboardPeriod = isDashboardPeriod(urlPeriod) ? urlPeriod : "7d";

  const [data, setData] = React.useState<DashboardSnapshot | null>(null);
  const [status, setStatus] = React.useState<"loading" | "success" | "error" | "empty">(
    "loading",
  );
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        if (active) setStatus("loading");
        const res = await fetch(`/api/dashboard?period=${period}`, {
          cache: "no-store",
        });
        if (!active) return;
        if (res.status === 503) {
          setData(null);
          setStatus("empty");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as DashboardSnapshot;
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

  function handlePeriodChange(next: DashboardPeriod) {
    const params = new URLSearchParams(searchParams);
    params.set("period", next);
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/dashboard?period=${period}`, { cache: "no-store" });
      if (res.status === 503) {
        setData(null);
        setStatus("empty");
      } else if (res.ok) {
        const json = (await res.json()) as DashboardSnapshot;
        setData(json);
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setRefreshing(false);
    }
  }

  const currency = data?.currency ?? "EUR";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Visão geral</h2>
          <p className="text-muted-foreground text-sm">
            Acompanhe os principais resultados da sua operação.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <span className="text-muted-foreground hidden text-xs sm:inline">
              Atualizado {timeAgoShort(data.generatedAt)}
            </span>
          )}
          <PeriodSelector value={period} onChange={handlePeriodChange} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || status === "loading"}
            aria-label="Atualizar dados"
          >
            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
            Atualizar
          </Button>
        </div>
      </div>

      {status === "loading" && <DashboardSkeleton />}

      {status === "error" && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Não foi possível carregar a dashboard</AlertTitle>
          <AlertDescription>
            Verifique a sua conexão e tente novamente.
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleRefresh}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {status === "empty" && (
        <Alert>
          <AlertCircle />
          <AlertTitle>Banco de dados não conectado</AlertTitle>
          <AlertDescription>
            Configure o Supabase para ver os dados reais da sua operação.
          </AlertDescription>
        </Alert>
      )}

      {status === "success" && data && (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Faturamento"
              value={formatMoney(data.revenueCents, currency, "pt-PT")}
              icon={Wallet}
              changePercent={data.revenueChangePercent}
            />
            <MetricCard
              label="Pedidos"
              value={formatNumber(data.ordersCount)}
              icon={ShoppingBag}
              changePercent={data.ordersChangePercent}
            />
            <MetricCard
              label="Ticket médio"
              value={
                data.averageTicketCents !== null
                  ? formatMoney(data.averageTicketCents, currency, "pt-PT")
                  : "—"
              }
              icon={CreditCard}
              changePercent={data.averageTicketChangePercent}
              unavailableHint="Ainda não há pedidos pagos neste período."
            />
            <MetricCard
              label="Taxa de conversão"
              value={
                data.conversionRate !== null ? formatPercent(data.conversionRate) : "—"
              }
              icon={TrendingUp}
              changePercent={data.conversionChangePercent}
              unavailableHint="Ainda não há sessões de visitantes suficientes rastreadas neste período."
            />
          </div>

          {/* Gráfico + produtos */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Desempenho de vendas</CardTitle>
                <CardDescription>Faturamento e pedidos no período</CardDescription>
              </CardHeader>
              <CardContent>
                <SalesChart data={data.chartSeries} currency={currency} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Produtos mais vendidos</CardTitle>
                <CardDescription>Até 5 produtos no período</CardDescription>
              </CardHeader>
              <CardContent>
                <TopProducts products={data.topProducts} currency={currency} />
              </CardContent>
            </Card>
          </div>

          {/* Indicadores secundários */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Faturamento de hoje"
              value={formatMoney(data.todayRevenueCents, currency, "pt-PT")}
              icon={Wallet}
            />
            <MetricCard
              label="Pedidos de hoje"
              value={formatNumber(data.todayOrdersCount)}
              icon={ShoppingBag}
            />
            <MetricCard
              label="Clientes no período"
              value={formatNumber(data.customersCount)}
              icon={Users}
            />
            <MetricCard
              label="Carrinhos abandonados"
              value={formatNumber(data.abandonedCartsCount)}
              icon={AlertCircle}
            />
          </div>

          {/* Pedidos recentes + funil */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pedidos recentes</CardTitle>
                <CardDescription>Os 8 pedidos mais recentes</CardDescription>
              </CardHeader>
              <CardContent>
                <RecentOrders orders={data.recentOrders} />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Funil de vendas</CardTitle>
                  <CardDescription>Do visitante à compra aprovada</CardDescription>
                </CardHeader>
                <CardContent>
                  <SalesFunnel steps={data.funnel} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Formas de pagamento</CardTitle>
                  <CardDescription>Participação no período</CardDescription>
                </CardHeader>
                <CardContent>
                  <PaymentMethods methods={data.paymentMethods} currency={currency} />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Alertas operacionais */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Atenção necessária</CardTitle>
              <CardDescription>Pendências que precisam da sua ação</CardDescription>
            </CardHeader>
            <CardContent>
              <OperationalAlerts alerts={data.alerts} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[96px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[360px]" />
        <Skeleton className="h-[360px]" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[96px]" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-[320px]" />
        <Skeleton className="h-[320px]" />
      </div>
    </div>
  );
}
