"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CreditCard,
  Download,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";

import {
  isDashboardPeriod,
  type DashboardPeriod,
} from "@/features/dashboard/period";
import type { DashboardSnapshot } from "@/features/dashboard/queries";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { MetricCard } from "@/features/dashboard/metric-card";
import { OperationalMetrics } from "@/features/dashboard/operational-metrics";
import { OrderStatusCard } from "@/features/dashboard/order-status-card";
import { PeriodSelector } from "@/features/dashboard/period-selector";
import { RecentOrders } from "@/features/dashboard/recent-orders";
import { SalesChart } from "@/features/dashboard/sales-chart";
import { TopProducts } from "@/features/dashboard/top-products";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const DASHBOARD_THEME =
  "-m-4 min-h-full overflow-hidden bg-[#0b080f] p-4 text-[#f8f5f8] md:-m-6 md:p-6 lg:p-7 [--accent:#291725] [--accent-foreground:#fff7fb] [--border:rgba(255,255,255,0.08)] [--card:#141019] [--card-foreground:#f8f5f8] [--destructive:#f87171] [--foreground:#f8f5f8] [--input:rgba(255,255,255,0.12)] [--muted:#241923] [--muted-foreground:#a596a2] [--popover:#1a121c] [--popover-foreground:#fff7fb] [--primary:#e91e8f] [--primary-foreground:#ffffff] [--ring:#f472b6] [--secondary:#241923] [--secondary-foreground:#f1e8ee] [--success:#34d399] [--warning:#fbbf24]";

const PANEL_CLASS =
  "gap-0 rounded-lg border-white/[0.07] bg-[#141019] py-0 shadow-[0_18px_55px_rgba(6,0,8,0.3)] ring-1 ring-fuchsia-400/[0.025] transition-colors hover:border-fuchsia-300/[0.12]";

function timeAgoShort(iso: string): string {
  const diffSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (diffSeconds < 10) return "agora mesmo";
  if (diffSeconds < 60) return `há ${diffSeconds}s`;
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `há ${minutes}min`;
  return `há ${Math.floor(minutes / 60)}h`;
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function exportRecentOrders(data: DashboardSnapshot) {
  const rows = [
    ["Pedido", "Cliente", "Produto", "Status", "Pagamento", "Valor", "Data"],
    ...data.recentOrders.map((order) => [
      order.reference,
      order.customerName ?? "",
      order.productName ?? "",
      order.status,
      order.paymentMethod ?? "",
      formatMoney(order.totalCents, order.currency, "pt-BR"),
      new Date(order.createdAt).toLocaleString("pt-BR"),
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dashboard-${data.period}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type DashboardRequestResult =
  | { status: "success"; data: DashboardSnapshot }
  | { status: "empty"; data: null };

async function requestDashboardSnapshot(
  period: DashboardPeriod,
  signal: AbortSignal,
): Promise<DashboardRequestResult> {
  const response = await fetch(`/api/dashboard?period=${period}`, {
    cache: "no-store",
    signal,
  });
  if (response.status === 503) return { status: "empty", data: null };
  if (!response.ok) throw new Error(String(response.status));
  return {
    status: "success",
    data: (await response.json()) as DashboardSnapshot,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function DashboardView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get("period");
  const period: DashboardPeriod = isDashboardPeriod(urlPeriod)
    ? urlPeriod
    : "7d";

  const [data, setData] = React.useState<DashboardSnapshot | null>(null);
  const [status, setStatus] = React.useState<
    "loading" | "success" | "error" | "empty"
  >("loading");
  const [refreshing, setRefreshing] = React.useState(false);
  const requestRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    void requestDashboardSnapshot(period, controller.signal)
      .then((result) => {
        setData(result.data);
        setStatus(result.status);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) setStatus("error");
      });

    return () => controller.abort();
  }, [period]);

  async function loadOnDemand() {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    try {
      const result = await requestDashboardSnapshot(period, controller.signal);
      setData(result.data);
      setStatus(result.status);
    } catch (error) {
      if (!isAbortError(error)) setStatus("error");
    }
  }

  function handlePeriodChange(next: DashboardPeriod) {
    if (next === period) return;
    setStatus("loading");
    const params = new URLSearchParams(searchParams);
    params.set("period", next);
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadOnDemand();
    setRefreshing(false);
  }

  function handleRetry() {
    setStatus("loading");
    void loadOnDemand();
  }

  const currency = data?.currency ?? "EUR";

  return (
    <section className={DASHBOARD_THEME} data-testid="dashboard-root">
      <div className="mx-auto max-w-[1680px] space-y-5 sm:space-y-6">
        <DashboardHeader
          data={data}
          period={period}
          refreshing={refreshing}
          loading={status === "loading"}
          onPeriodChange={handlePeriodChange}
          onRefresh={() => void handleRefresh()}
        />

        {status === "loading" ? <DashboardSkeleton /> : null}

        {status === "error" ? (
          <DashboardMessage
            title="Não foi possível carregar os dados da Dashboard."
            description="Verifique a sua conexão e tente novamente."
            actionLabel="Tentar novamente"
            onAction={handleRetry}
          />
        ) : null}

        {status === "empty" ? (
          <DashboardMessage
            title="Os dados da operação estão indisponíveis."
            description="A conexão com a base de dados precisa estar ativa para exibir métricas reais."
            actionLabel="Tentar novamente"
            onAction={handleRetry}
          />
        ) : null}

        {status === "success" && data ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Receita"
                value={formatMoney(data.revenueCents, currency, "pt-BR")}
                icon={Wallet}
                tone="rose"
                changePercent={data.revenueChangePercent}
              />
              <MetricCard
                label="Pedidos"
                value={formatNumber(data.ordersCount)}
                icon={ShoppingBag}
                tone="emerald"
                changePercent={data.ordersChangePercent}
              />
              <MetricCard
                label="Ticket médio"
                value={
                  data.averageTicketCents !== null
                    ? formatMoney(data.averageTicketCents, currency, "pt-BR")
                    : "—"
                }
                icon={CreditCard}
                tone="amber"
                changePercent={data.averageTicketChangePercent}
                unavailableHint="Ainda não há pedidos pagos neste período."
              />
              <MetricCard
                label="Conversão"
                value={
                  data.conversionRate !== null
                    ? formatPercent(data.conversionRate)
                    : "—"
                }
                icon={TrendingUp}
                tone="violet"
                changePercent={data.conversionChangePercent}
                unavailableHint="Ainda não há sessões de visitantes suficientes neste período."
              />
            </div>

            <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
              <Card className={`${PANEL_CLASS} min-h-[430px]`}>
                <CardHeader className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
                  <CardTitle className="text-base text-[#f7f9fc]">
                    Vendas
                  </CardTitle>
                  <CardDescription>
                    Desempenho das vendas no período selecionado
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-3 py-5 sm:px-6">
                  <SalesChart data={data.chartSeries} currency={currency} />
                </CardContent>
              </Card>

              <Card className={`${PANEL_CLASS} min-h-[430px]`}>
                <CardHeader className="border-b border-white/[0.06] px-5 py-5">
                  <CardTitle className="text-base text-[#f7f9fc]">
                    Status dos pedidos
                  </CardTitle>
                  <CardDescription>
                    Distribuição dos últimos pedidos registrados
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-5 py-5">
                  <OrderStatusCard orders={data.recentOrders} />
                </CardContent>
              </Card>
            </div>

            <OperationalMetrics snapshot={data} />

            <Card className={PANEL_CLASS}>
              <CardHeader className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
                <CardTitle className="text-base text-[#f7f9fc]">
                  Vendas recentes
                </CardTitle>
                <CardDescription>
                  Últimas vendas registradas na plataforma
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-1">
                <RecentOrders orders={data.recentOrders} />
              </CardContent>
            </Card>

            <Card className={PANEL_CLASS}>
              <CardHeader className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
                <CardTitle className="text-base text-[#f7f9fc]">
                  Produtos mais vendidos
                </CardTitle>
                <CardDescription>
                  Ranking por receita no período selecionado
                </CardDescription>
              </CardHeader>
              <CardContent className="px-5 py-5 sm:px-6">
                <TopProducts products={data.topProducts} currency={currency} />
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </section>
  );
}

interface DashboardHeaderProps {
  data: DashboardSnapshot | null;
  period: DashboardPeriod;
  refreshing: boolean;
  loading: boolean;
  onPeriodChange: (period: DashboardPeriod) => void;
  onRefresh: () => void;
}

function DashboardHeader({
  data,
  period,
  refreshing,
  loading,
  onPeriodChange,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-fuchsia-300">
          <span
            className="size-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_12px_rgba(232,121,249,0.65)]"
            aria-hidden="true"
          />
          VISÃO GERAL DA OPERAÇÃO
        </div>
        <h2 className="text-2xl font-semibold text-[#f8fafc] sm:text-[28px]">
          Dashboard
        </h2>
        <p className="mt-1 text-sm text-[#8d98a8]">
          Acompanhe o desempenho da sua operação em tempo real.
        </p>
      </div>

      <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
        {data ? (
          <span
            className="mr-1 hidden text-xs text-[#758195] xl:inline"
            aria-live="polite"
          >
            Atualizado {timeAgoShort(data.generatedAt)}
          </span>
        ) : null}
        <PeriodSelector value={period} onChange={onPeriodChange} />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/[0.03] text-[#eadfe7] hover:border-fuchsia-300/20 hover:bg-fuchsia-400/[0.08] hover:text-white"
            onClick={onRefresh}
            disabled={refreshing || loading}
            aria-label="Atualizar dados"
          >
            <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            Atualizar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/[0.03] text-[#eadfe7] hover:border-fuchsia-300/20 hover:bg-fuchsia-400/[0.08] hover:text-white"
            onClick={() => data && exportRecentOrders(data)}
            disabled={!data || data.recentOrders.length === 0}
            aria-label="Exportar vendas recentes"
          >
            <Download />
            Exportar
          </Button>
        </div>
      </div>
    </header>
  );
}

interface DashboardMessageProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

function DashboardMessage({
  title,
  description,
  actionLabel,
  onAction,
}: DashboardMessageProps) {
  return (
    <Card
      className={`${PANEL_CLASS} min-h-[320px] items-center justify-center`}
    >
      <CardContent className="flex max-w-md flex-col items-center px-6 py-12 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-red-400/15 bg-red-400/10 text-red-300">
          <AlertCircle className="size-5" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold text-[#f5f7fb]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#8d98a8]">{description}</p>
        <Button type="button" size="sm" className="mt-5" onClick={onAction}>
          <RefreshCw />
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" aria-label="Carregando Dashboard">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-[142px] rounded-lg bg-white/[0.06]"
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_350px]">
        <Skeleton className="h-[430px] rounded-lg bg-white/[0.06]" />
        <Skeleton className="h-[430px] rounded-lg bg-white/[0.06]" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-[112px] rounded-lg bg-white/[0.06]"
          />
        ))}
      </div>
      <Skeleton className="h-[360px] rounded-lg bg-white/[0.06]" />
      <Skeleton className="h-[260px] rounded-lg bg-white/[0.06]" />
    </div>
  );
}

export function DashboardRouteSkeleton() {
  return (
    <section className={DASHBOARD_THEME}>
      <div className="mx-auto max-w-[1680px] space-y-5 sm:space-y-6">
        <div className="space-y-3 py-1">
          <Skeleton className="h-4 w-40 bg-white/[0.06]" />
          <Skeleton className="h-8 w-52 bg-white/[0.06]" />
          <Skeleton className="h-4 w-80 max-w-full bg-white/[0.06]" />
        </div>
        <DashboardSkeleton />
      </div>
    </section>
  );
}
