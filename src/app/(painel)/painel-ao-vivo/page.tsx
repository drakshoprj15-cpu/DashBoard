import type { Metadata } from "next";
import { Database } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { LiveView } from "@/features/analytics/live-view";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Painel ao Vivo" };
export const dynamic = "force-dynamic";

export default function PainelAoVivoPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para acompanhar as sessões em tempo real."
        className="min-h-[420px]"
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Painel ao Vivo</h2>
        <p className="text-muted-foreground text-sm">
          Quem está na sua loja agora, o que está a ver e onde está no funil
        </p>
      </div>
      <LiveView />
    </div>
  );
}
