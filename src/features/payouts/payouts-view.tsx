import { Banknote, Info } from "lucide-react";

import { formatDateTime, formatMoney } from "@/lib/format";
import {
  PAYOUT_STATUS_LABEL,
  PAYOUT_STATUS_VARIANT,
} from "@/features/payouts/status";
import type { PayoutRow, PayoutsSummary } from "@/features/payouts/queries";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export interface PayoutsViewProps {
  payouts: PayoutRow[];
  summary: PayoutsSummary;
}

export function PayoutsView({ payouts, summary }: PayoutsViewProps) {
  const currency = payouts[0]?.currency ?? "EUR";

  const cards = [
    { label: "Já repassado", value: formatMoney(summary.paidCents, currency, "pt-PT") },
    { label: "A receber", value: formatMoney(summary.upcomingCents, currency, "pt-PT") },
    {
      label: "Próximo repasse",
      value: summary.nextPayout
        ? formatMoney(summary.nextPayout.amountCents, currency, "pt-PT")
        : "—",
      hint: summary.nextPayout?.expectedArrivalAt
        ? formatDateTime(summary.nextPayout.expectedArrivalAt, "pt-PT")
        : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <Alert variant="info">
        <Info />
        <AlertTitle>Como funciona</AlertTitle>
        <AlertDescription>
          Os repasses chegam automaticamente do gateway (Broski) via webhook — não há lançamento
          manual aqui. Enquanto nenhum repasse real for confirmado pelo gateway, esta página fica
          vazia.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardDescription className="text-xs">{c.label}</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-xl font-bold tracking-tight">{c.value}</p>
              {c.hint && <p className="text-muted-foreground mt-1 text-xs">{c.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className={payouts.length === 0 ? "" : "p-0 pt-4 sm:p-6 sm:pt-6"}>
          {payouts.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="Nenhum repasse ainda"
              description="Assim que o gateway confirmar o primeiro repasse, ele aparecerá aqui automaticamente."
              className="min-h-[280px]"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th scope="col" className="pr-3 pb-2.5 text-right font-medium">
                      Valor
                    </th>
                    <th scope="col" className="pr-3 pb-2.5 font-medium">
                      Conta
                    </th>
                    <th scope="col" className="pr-3 pb-2.5 font-medium">
                      Estado
                    </th>
                    <th scope="col" className="pr-3 pb-2.5 font-medium">
                      Previsto
                    </th>
                    <th scope="col" className="pb-2.5 font-medium">
                      Chegou em
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/40 border-b transition-colors last:border-0">
                      <td className="py-3 pr-3 text-right font-semibold whitespace-nowrap">
                        {formatMoney(p.amountCents, p.currency, "pt-PT")}
                      </td>
                      <td className="text-muted-foreground py-3 pr-3">
                        {p.bankAccountLabel ?? "—"}
                      </td>
                      <td className="py-3 pr-3">
                        <Badge variant={PAYOUT_STATUS_VARIANT[p.status]}>
                          {PAYOUT_STATUS_LABEL[p.status]}
                        </Badge>
                        {p.status === "failed" && p.failureReason && (
                          <p className="text-destructive mt-1 text-xs">{p.failureReason}</p>
                        )}
                      </td>
                      <td className="text-muted-foreground py-3 pr-3 text-xs whitespace-nowrap">
                        {p.expectedArrivalAt ? formatDateTime(p.expectedArrivalAt, "pt-PT") : "—"}
                      </td>
                      <td className="text-muted-foreground py-3 text-xs whitespace-nowrap">
                        {p.arrivedAt ? formatDateTime(p.arrivedAt, "pt-PT") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
