import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Financeiro · Processador" };

export default function ProcessadorPage() {
  return (
    <ModulePlaceholder
      title="Processador de pagamentos"
      description="Conexão e configuração de gateways com teste de conexão, webhooks e logs. Gateway principal: Broski (MB WAY + Multibanco, EUR) — adapter já implementado a partir da documentação oficial e aguardando credenciais (BROSKI_API_KEY). Stripe, Mercado Pago, Pagar.me e Asaas virão na Fase 4."
      phase={4}
    />
  );
}
