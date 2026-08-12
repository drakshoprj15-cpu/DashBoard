import { Activity } from "lucide-react";

import { formatNumber } from "@/lib/format";
import type { RecentOrderRow } from "@/features/dashboard/queries";

export interface OrderStatusCardProps {
  orders: RecentOrderRow[];
}

const STATUS_GROUPS = [
  {
    key: "approved",
    label: "Aprovados / pagos",
    statuses: new Set(["paid", "shipped", "delivered"]),
    barClass: "bg-emerald-400",
    dotClass: "bg-emerald-400",
  },
  {
    key: "pending",
    label: "Pendentes",
    statuses: new Set(["created", "processing", "preparing"]),
    barClass: "bg-amber-300",
    dotClass: "bg-amber-300",
  },
  {
    key: "awaiting",
    label: "Aguardando pagamento",
    statuses: new Set(["awaiting_payment"]),
    barClass: "bg-orange-400",
    dotClass: "bg-orange-400",
  },
  {
    key: "refused",
    label: "Recusados",
    statuses: new Set(["refused", "chargeback"]),
    barClass: "bg-red-400",
    dotClass: "bg-red-400",
  },
  {
    key: "cancelled",
    label: "Cancelados / expirados",
    statuses: new Set(["cancelled", "expired"]),
    barClass: "bg-zinc-400",
    dotClass: "bg-zinc-400",
  },
  {
    key: "refunded",
    label: "Reembolsados",
    statuses: new Set(["refunded"]),
    barClass: "bg-violet-400",
    dotClass: "bg-violet-400",
  },
] as const;

export function OrderStatusCard({ orders }: OrderStatusCardProps) {
  if (orders.length === 0) {
    return (
      <div className="flex h-[310px] flex-col items-center justify-center text-center">
        <span className="mb-3 flex size-10 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-[#758195]">
          <Activity className="size-5" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-[#c3cbd7]">
          Nenhum pedido registrado.
        </p>
        <p className="mt-1 text-xs text-[#758195]">
          Os status aparecerão aqui após a primeira venda.
        </p>
      </div>
    );
  }

  const knownStatuses = new Set(
    STATUS_GROUPS.flatMap((group) => Array.from(group.statuses)),
  );
  const rows = STATUS_GROUPS.map((group) => ({
    ...group,
    count: orders.filter((order) => group.statuses.has(order.status)).length,
  }));
  const otherCount = orders.filter(
    (order) => !knownStatuses.has(order.status),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between border-b border-white/[0.06] pb-4">
        <div>
          <p className="text-3xl font-semibold text-[#f7f9fc]">
            {formatNumber(orders.length)}
          </p>
          <p className="mt-1 text-xs text-[#7f8a9b]">pedidos analisados</p>
        </div>
        <span className="text-xs text-[#7f8a9b]">Últimos registros</span>
      </div>

      <div className="space-y-3.5">
        {rows.map((row) => {
          const percentage = (row.count / orders.length) * 100;
          return (
            <div key={row.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-center gap-2 text-[#aab3c0]">
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${row.dotClass}`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{row.label}</span>
                </span>
                <span className="shrink-0 font-semibold text-[#e8edf4]">
                  {formatNumber(row.count)} ·{" "}
                  {percentage.toLocaleString("pt-BR", {
                    maximumFractionDigits: 0,
                  })}
                  %
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full ${row.barClass}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}

        {otherCount > 0 ? (
          <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3 text-xs">
            <span className="text-[#8d98a8]">Outros status</span>
            <span className="font-semibold text-[#e8edf4]">
              {formatNumber(otherCount)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
