import type { Metadata } from "next";

import { LedgerView } from "@/features/ledger/ledger-table";

export const metadata: Metadata = { title: "Financeiro · Entradas/Saídas" };

export default function EntradasSaidasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Entradas e Saídas</h2>
        <p className="text-muted-foreground text-sm">
          Livro-caixa da operação: vendas, reembolsos e lançamentos manuais
        </p>
      </div>
      <LedgerView />
    </div>
  );
}
