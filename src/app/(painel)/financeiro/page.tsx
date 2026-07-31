import type { Metadata } from "next";

import { OverviewView } from "@/features/finance/overview-view";

export const metadata: Metadata = { title: "Financeiro · Visão Geral" };

export default function FinanceiroPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Financeiro</h2>
        <p className="text-muted-foreground text-sm">
          Saldo, movimentação e próximos repasses da operação
        </p>
      </div>
      <OverviewView />
    </div>
  );
}
