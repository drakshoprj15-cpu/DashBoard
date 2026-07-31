import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Boxes, Database } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import {
  listInventoryProducts,
  summarizeInventory,
} from "@/features/inventory/queries";
import { formatNumber } from "@/lib/format";
import { StockTable } from "@/features/inventory/stock-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Catálogo · Estoque" };
export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para controlar o estoque."
        className="min-h-[420px]"
      />
    );
  }

  const products = await listInventoryProducts();
  const summary = summarizeInventory(products);

  const cards = [
    { label: "Produtos controlados", value: formatNumber(summary.trackedCount) },
    { label: "Unidades em estoque", value: formatNumber(summary.totalUnits) },
    { label: "Estoque baixo", value: formatNumber(summary.lowStockCount) },
    { label: "Sem estoque", value: formatNumber(summary.outOfStockCount) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Estoque</h2>
        <p className="text-muted-foreground text-sm">
          Controle de estoque por produto, movimentações e alertas de estoque mínimo
        </p>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum produto com controle de estoque"
          description='Ative "Controlar estoque" nos produtos físicos para eles aparecerem aqui.'
          action={
            <Button asChild>
              <Link href="/catalogo/produtos">Ir para o catálogo</Link>
            </Button>
          }
          className="min-h-[320px]"
        />
      ) : (
        <>
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

          {(summary.outOfStockCount > 0 || summary.lowStockCount > 0) && (
            <div className="border-warning/40 bg-warning/10 text-warning-foreground dark:text-warning flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                {summary.outOfStockCount > 0 && (
                  <>
                    <strong>{formatNumber(summary.outOfStockCount)}</strong> produto(s) sem estoque
                    {summary.lowStockCount > 0 && " e "}
                  </>
                )}
                {summary.lowStockCount > 0 && (
                  <>
                    <strong>{formatNumber(summary.lowStockCount)}</strong> com estoque baixo
                  </>
                )}
                . Ajuste ou reponha antes que afete as vendas.
              </p>
            </div>
          )}

          <Card>
            <CardContent className="p-0 pt-4 sm:p-6 sm:pt-6">
              <StockTable products={products} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
