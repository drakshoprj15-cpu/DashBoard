import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Pedidos" };

export default function PedidosPage() {
  return (
    <ModulePlaceholder
      title="Pedidos"
      description="Gestão completa de pedidos: linha do tempo, pagamentos, webhooks, UTMs, reembolsos, reenvio de produto digital e exportação."
      phase={4}
    />
  );
}
