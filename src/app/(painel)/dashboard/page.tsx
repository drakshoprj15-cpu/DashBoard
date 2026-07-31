import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { getSession } from "@/lib/auth/session";
import {
  demoKpis,
  demoRecentOrders,
  demoRevenueByDay,
  demoTopProducts,
} from "@/lib/demo-data";
import { cn } from "@/lib/utils";
import { RevenueChart } from "@/features/dashboard/revenue-chart";
import { DashboardView } from "@/features/dashboard/dashboard-view";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Dashboard" };

const statusVariant: Record<string, "success" | "warning" | "destructive"> = {
  Pago: "success",
  Pendente: "warning",
  Recusado: "destructive",
};

export default async function DashboardPage() {
  const session = await getSession();
  const demoMode = session?.demoMode ?? true;

  if (!demoMode) {
    return (
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <DashboardView />
      </Suspense>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            Visão geral da operação
          </h2>
          <p className="text-muted-foreground text-sm">
            Últimos 7 dias · dados de demonstração
          </p>
        </div>
        <Badge variant="warning">Dados fictícios (modo demo)</Badge>
      </div>

      {/* KPIs de vendas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {demoKpis.map((kpi) => {
          const positive = kpi.change >= 0;
          return (
            <Card key={kpi.label} className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-xs">
                  {kpi.label}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-lg font-bold tracking-tight md:text-xl">
                  {kpi.value}
                </p>
                <p
                  className={cn(
                    "mt-1 flex items-center gap-0.5 text-xs font-medium",
                    positive ? "text-success" : "text-destructive",
                  )}
                >
                  {positive ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : (
                    <ArrowDownRight className="size-3.5" />
                  )}
                  {Math.abs(kpi.change).toLocaleString("pt-BR")}%
                  <span className="text-muted-foreground ml-1 font-normal">
                    vs. período anterior
                  </span>
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Gráfico de receita */}
      <Card>
        <CardHeader>
          <CardTitle>Receita por dia</CardTitle>
          <CardDescription>
            Receita aprovada vs. pendente nos últimos 7 dias
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RevenueChart data={demoRevenueByDay} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Produtos mais vendidos */}
        <Card>
          <CardHeader>
            <CardTitle>Produtos mais vendidos</CardTitle>
            <CardDescription>Por receita no período</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Produto</th>
                    <th className="pb-2 text-right font-medium">Qtd.</th>
                    <th className="pb-2 text-right font-medium">Receita</th>
                    <th className="pb-2 text-right font-medium">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {demoTopProducts.map((p) => (
                    <tr key={p.position} className="border-b last:border-0">
                      <td className="text-muted-foreground py-2.5">
                        {p.position}
                      </td>
                      <td className="py-2.5 font-medium">{p.name}</td>
                      <td className="py-2.5 text-right">{p.sold}</td>
                      <td className="py-2.5 text-right font-medium">
                        {p.revenue}
                      </td>
                      <td className="text-muted-foreground py-2.5 text-right">
                        {p.conversion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Pedidos recentes */}
        <Card>
          <CardHeader>
            <CardTitle>Pedidos recentes</CardTitle>
            <CardDescription>Últimas transações registradas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="pb-2 font-medium">Ref.</th>
                    <th className="pb-2 font-medium">Cliente</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                    <th className="pb-2 text-right font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {demoRecentOrders.map((o) => (
                    <tr key={o.ref} className="border-b last:border-0">
                      <td className="py-2.5 font-mono text-xs">{o.ref}</td>
                      <td className="py-2.5">
                        <p className="font-medium">{o.customer}</p>
                        <p className="text-muted-foreground text-xs">
                          {o.product}
                        </p>
                      </td>
                      <td className="py-2.5 text-right font-medium">
                        {o.total}
                      </td>
                      <td className="py-2.5 text-right">
                        <Badge variant={statusVariant[o.status] ?? "muted"}>
                          {o.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
