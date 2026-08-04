import type { Metadata } from "next";
import { BellOff, Bell, Database, Users } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import {
  listCustomers,
  summarizeCustomers,
} from "@/features/customers/queries";
import { toggleMarketingConsentAction } from "@/features/customers/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para ver os clientes reais."
        className="min-h-[420px]"
      />
    );
  }

  const rows = await listCustomers();
  const summary = summarizeCustomers(rows);

  const cards = [
    { label: "Total de clientes", value: String(summary.total) },
    { label: "Compraram", value: String(summary.buyers) },
    {
      label: "Receita total",
      value: formatMoney(summary.revenueCents, "EUR", "pt-PT"),
    },
    {
      label: "Ticket médio",
      value: formatMoney(summary.averageTicketCents, "EUR", "pt-PT"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Clientes</h2>
        <p className="text-muted-foreground text-sm">
          Quem já comprou ou tentou comprar, ordenado por valor gasto
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
          icon={Users}
          title="Nenhum cliente ainda"
          description="Assim que alguém preencher o checkout, aparece aqui com o histórico de pedidos e o valor gasto."
          className="min-h-[320px]"
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="pb-2.5 font-medium">Cliente</th>
                  <th className="pb-2.5 text-right font-medium">Pedidos</th>
                  <th className="pb-2.5 text-right font-medium">Gasto total</th>
                  <th className="pb-2.5 text-right font-medium">
                    Ticket médio
                  </th>
                  <th className="pb-2.5 font-medium">Última compra</th>
                  <th className="pb-2.5 font-medium">Marketing</th>
                  <th className="pb-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-muted-foreground text-xs">{c.email}</p>
                      {c.phone && (
                        <p className="text-muted-foreground text-xs">
                          {c.phone}
                        </p>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      {c.orderCount}
                      {c.paidCount > 0 && (
                        <span className="text-success block text-xs">
                          {c.paidCount} pagos
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatMoney(c.totalSpentCents, "EUR", "pt-PT")}
                    </td>
                    <td className="text-muted-foreground py-3 text-right">
                      {c.paidCount > 0
                        ? formatMoney(c.averageTicketCents, "EUR", "pt-PT")
                        : "—"}
                    </td>
                    <td className="text-muted-foreground py-3 text-xs">
                      {c.lastOrderAt ? formatDate(c.lastOrderAt, "pt-PT") : "—"}
                    </td>
                    <td className="py-3">
                      <Badge variant={c.marketingOptOut ? "muted" : "success"}>
                        {c.marketingOptOut ? "Não recebe" : "Recebe"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end">
                        <form action={toggleMarketingConsentAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <input
                            type="hidden"
                            name="optOut"
                            value={String(!c.marketingOptOut)}
                          />
                          <Button size="sm" variant="outline" type="submit">
                            {c.marketingOptOut ? <Bell /> : <BellOff />}
                            {c.marketingOptOut ? "Reativar" : "Bloquear"}
                          </Button>
                        </form>
                      </div>
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
