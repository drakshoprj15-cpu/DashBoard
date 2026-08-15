import type { Metadata } from "next";
import { Database, ShoppingBag } from "lucide-react";

import { listOrders, summarizeOrders } from "@/features/orders/queries";
import { STATUS_LABEL, STATUS_VARIANT } from "@/features/orders/status";
import { isDatabaseConfigured } from "@/database/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Pedidos" };
export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  mbway: "MB WAY",
  multibanco: "Multibanco",
};

export default async function PedidosPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure as variáveis do Supabase para ver os pedidos reais. Nenhum dado fictício é exibido aqui."
        className="min-h-[420px]"
      />
    );
  }

  const rows = await listOrders();
  const summary = summarizeOrders(rows);

  const cards = [
    { label: "Total de pedidos", value: String(summary.totalOrders) },
    { label: "Pedidos pagos", value: String(summary.paidOrders) },
    {
      label: "Receita aprovada",
      value: formatMoney(summary.paidRevenueCents, "EUR", "pt-PT"),
    },
    {
      label: "Aguardando pagamento",
      value: formatMoney(summary.awaitingRevenueCents, "EUR", "pt-PT"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Pedidos</h2>
        <p className="text-muted-foreground text-sm">
          Vendas registradas no banco de dados, atualizadas pelo webhook do
          gateway
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardDescription className="text-xs">{c.label}</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-lg font-bold tracking-tight md:text-xl">
                {c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Nenhum pedido ainda"
          description="Assim que a primeira compra for feita no checkout, ela aparecerá aqui com cliente, valor, forma de pagamento e estado."
          className="min-h-[320px]"
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="pb-2.5 font-medium">Referência</th>
                  <th className="pb-2.5 font-medium">Cliente</th>
                  <th className="pb-2.5 font-medium">Produto</th>
                  <th className="pb-2.5 text-right font-medium">Total</th>
                  <th className="pb-2.5 font-medium">Pagamento</th>
                  <th className="pb-2.5 font-medium">Estado</th>
                  <th className="pb-2.5 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="py-3 font-mono text-xs">{o.reference}</td>
                    <td className="py-3">
                      <p className="font-medium">{o.customerName ?? "—"}</p>
                      <p className="text-muted-foreground text-xs">
                        {o.customerEmail ?? ""}
                      </p>
                    </td>
                    <td className="py-3">
                      {o.productName ?? "—"}
                      {o.quantity && o.quantity > 1 && (
                        <span className="text-muted-foreground">
                          {" "}
                          ×{o.quantity}
                        </span>
                      )}
                      {o.variantName && (
                        <span className="text-muted-foreground block text-xs">
                          {o.variantName}
                          {o.sku ? ` · ${o.sku}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatMoney(o.totalCents, o.currency, "pt-PT")}
                    </td>
                    <td className="py-3">
                      {o.paymentMethod
                        ? (METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod)
                        : "—"}
                    </td>
                    <td className="py-3">
                      <Badge variant={STATUS_VARIANT[o.status] ?? "muted"}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground py-3 text-xs">
                      {formatDateTime(o.createdAt, "pt-PT")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
