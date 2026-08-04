import type { Metadata } from "next";
import { Database, Info, XCircle, CheckCircle2 } from "lucide-react";

import { isDatabaseConfigured } from "@/database/client";
import {
  getCustomRecipients,
  getSegmentCounts,
} from "@/features/emails/segments";
import { isResendConfigured } from "@/features/emails/resend-provider";
import { CampaignForm } from "@/features/emails/campaign-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Emails" };
export const dynamic = "force-dynamic";

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
    .map((s) => s.trim())
    .filter((s) => UUID_REGEX.test(s))
    .slice(0, 500);

  const [counts, customRecipients] = await Promise.all([
    getSegmentCounts(),
    customerIds.length > 0
      ? getCustomRecipients(customerIds)
      : Promise.resolve(null),
  ]);
  const resendReady = isResendConfigured();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Emails</h2>
          <p className="text-muted-foreground text-sm">
            Disparos para os seus clientes, segmentados por estado do pagamento
          </p>
        </div>
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
      </div>

      {!resendReady && (
        <Alert variant="warning">
          <Info />
          <AlertTitle>Envio ainda não ativo</AlertTitle>
          <AlertDescription>
            Os segmentos abaixo já são reais (vêm do seu banco de dados), mas
            para enviar é preciso criar conta em resend.com, verificar o seu
            domínio e definir <code className="font-mono">RESEND_API_KEY</code>{" "}
            e <code className="font-mono">RESEND_FROM_EMAIL</code> na Vercel.
            Nenhum e-mail é enviado enquanto isso.
          </AlertDescription>
        </Alert>
      )}

      <Alert variant="info">
        <Info />
        <AlertTitle>Quem nunca recebe</AlertTitle>
        <AlertDescription>
          Clientes que pediram para não receber comunicações, que estão
          bloqueados ou que se descadastraram são automaticamente excluídos de
          todos os segmentos — exigência do RGPD.
        </AlertDescription>
      </Alert>

      <CampaignForm
        counts={counts}
        resendReady={resendReady}
        customRecipients={customRecipients}
        customerIdsParam={customerIds.join(",")}
      />
    </div>
  );
}
