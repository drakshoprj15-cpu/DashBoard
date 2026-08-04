"use client";

import * as React from "react";
import { CheckCircle2, CreditCard, Loader2, XCircle } from "lucide-react";

import { testBroskiConnectionAction } from "@/features/payment-providers/actions";
import type { ConnectionTestResult } from "@/payment-providers/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface CredentialCheck {
  label: string;
  present: boolean;
}

export interface ProcessorViewProps {
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  webhookUrl: string;
}

export function ProcessorView({
  hasApiKey,
  hasWebhookSecret,
  webhookUrl,
}: ProcessorViewProps) {
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState<ConnectionTestResult | null>(null);

  const checks: CredentialCheck[] = [
    { label: "Chave da API (BROSKI_API_KEY) configurada", present: hasApiKey },
    {
      label: "Segredo do webhook (BROSKI_WEBHOOK_SECRET) configurado",
      present: hasWebhookSecret,
    },
  ];

  const active = hasApiKey && hasWebhookSecret;

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const outcome = await testBroskiConnectionAction();
      setResult(outcome);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">
          Processador de pagamentos
        </h2>
        <p className="text-muted-foreground text-sm">
          Escolhe quem processa os pagamentos MB WAY/Multibanco do checkout
          (loja e landing pages).
        </p>
      </div>

      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="size-4" />
                Broski
              </CardTitle>
              <CardDescription>
                Gateway principal (PT). MB WAY e Multibanco via API server-side
                — adapter implementado a partir da documentação oficial.
              </CardDescription>
            </div>
            <Badge variant={active ? "success" : "muted"}>
              {active ? "Ativo" : "Desconectado"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1.5">
            {checks.map((check) => (
              <li key={check.label} className="flex items-center gap-2 text-sm">
                {check.present ? (
                  <CheckCircle2 className="text-success size-4 shrink-0" />
                ) : (
                  <XCircle className="text-muted-foreground size-4 shrink-0" />
                )}
                <span className={cn(!check.present && "text-muted-foreground")}>
                  {check.label}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleTest}
              disabled={!hasApiKey || testing}
              variant="outline"
              size="sm"
            >
              {testing && <Loader2 className="size-4 animate-spin" />}
              Testar conexão
            </Button>
          </div>

          {result && (
            <Alert variant={result.ok ? "default" : "destructive"}>
              {result.ok ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}

          <p className="text-muted-foreground text-xs">
            Webhook Broski:{" "}
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
              {webhookUrl}
            </code>{" "}
            (registado no painel da Broski).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
