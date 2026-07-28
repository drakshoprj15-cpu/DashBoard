import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Carrinhos" };

export default function CarrinhosPage() {
  return (
    <ModulePlaceholder
      title="Carrinhos"
      description="Carrinhos ativos, abandonados e convertidos, com valor abandonado, taxa de recuperação e sequências de recuperação por e-mail com consentimento."
      phase={9}
    />
  );
}
