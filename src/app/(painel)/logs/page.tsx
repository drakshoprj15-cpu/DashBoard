import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Logs" };

export default function LogsPage() {
  return (
    <ModulePlaceholder
      title="Logs"
      description="Auditoria e logs de integrações, webhooks, pixels e ações administrativas — com busca, filtros e dados sensíveis mascarados."
      phase={7}
    />
  );
}
