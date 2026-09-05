import type { Metadata } from "next";
import {
  CheckCircle2,
  Clock3,
  Database,
  Info,
  MailCheck,
  MailX,
  Send,
  XCircle,
} from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import { getEmailDashboardOverview } from "@/features/emails/campaigns";
import { CampaignHistory } from "@/features/emails/campaign-history";
import {
  getCustomRecipients,
  getSegmentCounts,
  getSegmentRecipients,
} from "@/features/emails/segments";
import { isResendConfigured } from "@/features/emails/resend-provider";
import { CampaignForm } from "@/features/emails/campaign-form";
import { PaidCustomersImport } from "@/features/emails/paid-customers-import";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Emails" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ recipients?: string }>;
}) {
  if (!isDatabaseConfigured()) {
    return (
      <EmptyState
        icon={Database}
        title="Banco de dados não conectado"
        description="Configure o Supabase para segmentar os clientes."
        className="min-h-[420px]"
      />
    );
  }

  const { recipients: recipientsParamRaw } = await searchParams;
  const customerIds = (recipientsParamRaw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => UUID_REGEX.test(value));

  const [counts, customRecipients, overview, pendingRecipients] =
    await Promise.all([
      getSegmentCounts(),
      customerIds.length > 0
        ? getCustomRecipients(customerIds)
        : Promise.resolve(null),
      getEmailDashboardOverview(),
      getSegmentRecipients("pending").then((recipients) =>
        recipients.slice(0, 25),
      ),
    ]);
  const resendReady = isResendConfigured();
  const summary = [
    { label: "Total", value: overview.stats.total, icon: Send },
    { label: "Enviados", value: overview.stats.sent, icon: MailCheck },
    { label: "Falhados", value: overview.stats.failed, icon: MailX },
    { label: "Em fila", value: overview.stats.queued, icon: Clock3 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Emails</h2>
          <p className="text-muted-foreground text-sm">
            Recuperação de carrinhos e disparos segmentados para os seus
            clientes
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={resendReady ? "success" : "muted"}>
            {resendReady ? (
              <>
                <CheckCircle2 /> Resend conectado
              </>
            ) : (
              <>
                <XCircle /> Resend não configurado
              </>
            )}
          </Badge>
          <PaidCustomersImport />
        </div>
      </div>

      {!resendReady && (
        <Alert variant="warning">
          <Info />
          <AlertTitle>Envio ainda não ativo</AlertTitle>
          <AlertDescription>
            Conclua a ligação do Resend nas configurações de implantação. A
            chave de envio fica protegida no servidor.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.map((item) => (
          <Card key={item.label}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-muted-foreground text-xs font-medium uppercase">
                  {item.label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {item.value}
                </p>
              </div>
              <item.icon className="text-muted-foreground size-5" />
            </CardContent>
          </Card>
        ))}
      </div>

      <CampaignForm
        counts={counts}
        resendReady={resendReady}
        customRecipients={customRecipients}
        customerIdsParam={customerIds.join(",")}
        pendingRecipients={pendingRecipients}
        initialDispatchId={crypto.randomUUID()}
      />

      <CampaignHistory campaigns={overview.history} />

      <Alert variant="info">
        <Info />
        <AlertTitle>Proteção automática</AlertTitle>
        <AlertDescription>
          Clientes bloqueados, descadastrados ou sem consentimento são
          excluídos. Cada disparo usa uma chave única para impedir reenvios
          duplicados.
        </AlertDescription>
      </Alert>
    </div>
  );
}
