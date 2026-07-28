import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Integrações" };

export default function IntegracoesPage() {
  return (
    <ModulePlaceholder
      title="Integrações"
      description="Central de integrações por categoria (pagamentos, pixels, e-mail, automação) com status, ambiente, teste de conexão, logs e credenciais criptografadas. Cada integração ficará claramente marcada como conectada ou desconectada."
      phase={7}
    />
  );
}
