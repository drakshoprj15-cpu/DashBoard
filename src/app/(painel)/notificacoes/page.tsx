import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Notificações" };

export default function NotificacoesPage() {
  return (
    <ModulePlaceholder
      title="Notificações"
      description="Central de notificações in-app, e-mail e web push para vendas, pagamentos, estoque baixo, reembolsos, erros de webhook e mais — com configuração por canal, evento e frequência."
      phase={9}
    />
  );
}
