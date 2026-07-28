import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Clientes" };

export default function ClientesPage() {
  return (
    <ModulePlaceholder
      title="Clientes"
      description="CRM com histórico de pedidos, LTV, consentimentos, segmentos, importação/exportação CSV e anotações internas."
      phase={9}
    />
  );
}
