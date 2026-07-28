import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Financeiro · Repasses" };

export default function RepassesPage() {
  return (
    <ModulePlaceholder
      title="Repasses"
      description="Saldo disponível e pendente, próximos pagamentos, valores em processamento e histórico de repasses por gateway e conta bancária."
      phase={6}
    />
  );
}
