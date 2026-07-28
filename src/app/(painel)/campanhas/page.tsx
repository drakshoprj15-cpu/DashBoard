import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Campanhas" };

export default function CampanhasPage() {
  return (
    <ModulePlaceholder
      title="Campanhas"
      description="Gerenciador de campanhas com UTMs, gerador de links, custos manuais/CSV, ROAS, CPA e relatórios. Arquitetura preparada para APIs oficiais de Meta, Google e TikTok Ads."
      phase={5}
    />
  );
}
