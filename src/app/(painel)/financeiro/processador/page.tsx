import type { Metadata } from "next";

import { ProcessorView } from "@/features/payment-providers/processor-view";

export const metadata: Metadata = { title: "Financeiro · Processador" };

export default function ProcessadorPage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://<seu-dominio>";

  return (
    <ProcessorView
      hasApiKey={Boolean(process.env.BROSKI_API_KEY)}
      hasWebhookSecret={Boolean(process.env.BROSKI_WEBHOOK_SECRET)}
      webhookUrl={`${appUrl}/api/webhooks/broski`}
    />
  );
}
