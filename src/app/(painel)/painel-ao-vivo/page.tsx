import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Painel ao Vivo" };

export default function PainelAoVivoPage() {
  return (
    <ModulePlaceholder
      title="Painel ao Vivo"
      description="Central de acompanhamento em tempo real: pessoas online, sessões, funil ao vivo, feed de eventos e etapas de checkout. Será construída com Supabase Realtime."
      phase={5}
    />
  );
}
