import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { formatDateTime, formatMoney } from "@/lib/format";
import { STATUS_LABEL, STATUS_VARIANT } from "@/features/orders/status";
import type { RecentOrderRow } from "@/features/dashboard/queries";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

const METHOD_LABEL: Record<string, string> = {
  mbway: "MB WAY",
  multibanco: "Multibanco",
  card: "Cartão",
  pix: "Pix",
  boleto: "Boleto",
};

export interface RecentOrdersProps {
  orders: RecentOrderRow[];
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Nenhum pedido no período"
        description="Assim que a primeira compra for feita, ela aparecerá aqui."
        className="min-h-[220px]"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th scope="col" className="pr-3 pb-2.5 font-medium">
                Referência
              </th>
              <th scope="col" className="pr-3 pb-2.5 font-medium">
                Cliente
              </th>
              <th scope="col" className="pr-3 pb-2.5 font-medium">
                Produto
              </th>
              <th scope="col" className="pr-3 pb-2.5 text-right font-medium">
                Total
              </th>
              <th scope="col" className="pr-3 pb-2.5 font-medium">
                Pagamento
              </th>
              <th scope="col" className="pr-3 pb-2.5 font-medium">
                Estado
              </th>
              <th scope="col" className="pb-2.5 font-medium">
                Data
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr
                key={o.id}
                className="hover:bg-muted/40 border-b transition-colors last:border-0"
              >
                <td className="py-3 pr-3 font-mono text-xs">{o.reference}</td>
                <td className="max-w-[160px] truncate py-3 pr-3">
                  {o.customerName ?? "—"}
                </td>
                <td className="max-w-[180px] truncate py-3 pr-3">
                  {o.productName ?? "—"}
                  {o.quantity && o.quantity > 1 && (
                    <span className="text-muted-foreground">
                      {" "}
                      ×{o.quantity}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-3 text-right font-medium whitespace-nowrap">
                  {formatMoney(o.totalCents, o.currency, "pt-PT")}
                </td>
                <td className="py-3 pr-3 whitespace-nowrap">
                  {o.paymentMethod
                    ? (METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod)
                    : "—"}
                </td>
                <td className="py-3 pr-3">
                  <Badge variant={STATUS_VARIANT[o.status] ?? "muted"}>
                    {STATUS_LABEL[o.status] ?? o.status}
                  </Badge>
                </td>
                <td className="text-muted-foreground py-3 text-xs whitespace-nowrap">
                  {formatDateTime(o.createdAt, "pt-PT")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <Link
          href="/pedidos"
          className="text-primary text-xs font-medium hover:underline"
        >
          Ver todos os pedidos
        </Link>
      </div>
    </div>
  );
}
