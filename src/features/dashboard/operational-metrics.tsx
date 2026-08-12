import {
  CircleCheckBig,
  Clock3,
  ShoppingCart,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { formatNumber } from "@/lib/format";
import type { DashboardSnapshot } from "@/features/dashboard/queries";

export interface OperationalMetricsProps {
  snapshot: DashboardSnapshot;
}

interface OperationalMetric {
  label: string;
  value: number;
  helper: string;
  icon: LucideIcon;
  iconClass: string;
}

export function OperationalMetrics({ snapshot }: OperationalMetricsProps) {
  const pendingPayments =
    snapshot.alerts.find((alert) => alert.key === "pending_payments")?.count ??
    0;

  const metrics: OperationalMetric[] = [
    {
      label: "Pagamentos aprovados",
      value: snapshot.paidOrdersCount,
      helper: "No período selecionado",
      icon: CircleCheckBig,
      iconClass: "bg-emerald-400/10 text-emerald-300",
    },
    {
      label: "Pagamentos pendentes",
      value: pendingPayments,
      helper: "Precisam de acompanhamento",
      icon: Clock3,
      iconClass: "bg-amber-400/10 text-amber-300",
    },
    {
      label: "Clientes no período",
      value: snapshot.customersCount,
      helper: "Clientes únicos com pedido",
      icon: UsersRound,
      iconClass: "bg-fuchsia-400/10 text-fuchsia-300",
    },
    {
      label: "Carrinhos pendentes",
      value: snapshot.abandonedCartsCount,
      helper: "Ainda não finalizados",
      icon: ShoppingCart,
      iconClass: "bg-violet-400/10 text-violet-300",
    },
  ];

  return (
    <section aria-labelledby="operational-metrics-title" className="space-y-3">
      <div>
        <h3
          id="operational-metrics-title"
          className="text-sm font-semibold text-[#e8edf4]"
        >
          Métricas operacionais
        </h3>
        <p className="mt-0.5 text-xs text-[#758195]">
          Indicadores para acompanhar a rotina de vendas
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="min-h-[118px] min-w-0 rounded-lg border border-white/[0.07] bg-[#141019] px-4 py-4 shadow-[0_14px_34px_rgba(6,0,8,0.22)] ring-1 ring-fuchsia-400/[0.02] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-fuchsia-300/[0.15] motion-reduce:transform-none sm:px-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#8d98a8]">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-[#f7f9fc]">
                    {formatNumber(metric.value)}
                  </p>
                </div>
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-md ${metric.iconClass}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-[#6f7b8d]">
                {metric.helper}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
