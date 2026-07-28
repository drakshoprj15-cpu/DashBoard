import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Financeiro · Visão Geral" };

export default function FinanceiroPage() {
  return (
    <ModulePlaceholder
      title="Financeiro — Visão Geral"
      description="Saldos, receitas, taxas, reembolsos, chargebacks e repasses com gráficos e filtros por gateway, moeda e período."
      phase={6}
    />
  );
}
