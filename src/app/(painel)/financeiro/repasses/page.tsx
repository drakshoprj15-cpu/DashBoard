import type { Metadata } from "next";
import { Database } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { getPayoutsSummary, listPayouts } from "@/features/payouts/queries";
import { PayoutsView } from "@/features/payouts/payouts-view";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Financeiro · Repasses" };
export const dynamic = "force-dynamic";

export default async function RepassesPage() {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para acompanhar os repasses."
        className="min-h-[420px]"
      />
    );
  }

  const [payouts, summary] = await Promise.all([
    listPayouts(),
    getPayoutsSummary(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Repasses</h2>
        <p className="text-muted-foreground text-sm">
          Saldo repassado e previsto pelo gateway de pagamento
        </p>
      </div>
      <PayoutsView payouts={payouts} summary={summary} />
    </div>
  );
}
