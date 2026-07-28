import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Emails" };

export default function EmailsPage() {
  return (
    <ModulePlaceholder
      title="Emails"
      description="Disparos com editor por blocos, variáveis dinâmicas, segmentação de destinatários, agendamento, relatórios de abertura/clique e integração Resend."
      phase={9}
    />
  );
}
