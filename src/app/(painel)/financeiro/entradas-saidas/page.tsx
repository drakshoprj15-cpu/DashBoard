import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Financeiro · Entradas/Saídas" };

export default function EntradasSaidasPage() {
  return (
    <ModulePlaceholder
      title="Entradas e Saídas"
      description="Livro-caixa completo: vendas, taxas, reembolsos, repasses, lançamentos manuais, categorias personalizadas, exportação CSV/XLSX e saldo acumulado."
      phase={6}
    />
  );
}
