"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";

import {
  deleteDomainAction,
  toggleDomainAction,
  verifyDomainAction,
  type DomainActionResult,
} from "@/features/domains/actions";
import type { DomainRow } from "@/features/domains/queries";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function DomainCard({ domain }: { domain: DomainRow }) {
  const [verifyState, verifyAction, verifying] = useActionState<
    DomainActionResult | null,
    FormData
  >(verifyDomainAction, null);
  const [copied, setCopied] = React.useState(false);

  const url = `https://${domain.hostname}`;

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="gap-3 py-4">
      <CardContent className="space-y-3 px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Globe className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{domain.hostname}</p>
              <p className="text-muted-foreground truncate text-sm">
                {domain.productName
                  ? `Serve a landing de ${domain.productName}`
                  : "Sem produto na raiz — só /p/slug e checkout"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={domain.isVerified ? "success" : "warning"}>
              {domain.isVerified ? "Verificado" : "A aguardar DNS"}
            </Badge>
            {!domain.isActive && <Badge variant="secondary">Desligado</Badge>}
          </div>
        </div>

        {verifyState?.error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{verifyState.error}</AlertDescription>
          </Alert>
        )}
        {verifyState?.ok && verifyState.message && (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertDescription>{verifyState.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[11px]">
            {url}
          </code>
          <Button size="sm" variant="ghost" onClick={copyUrl}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink /> Abrir
            </a>
          </Button>

          <form action={verifyAction}>
            <input type="hidden" name="id" value={domain.id} />
            <Button
              size="sm"
              variant="outline"
              type="submit"
              disabled={verifying}
            >
              <RefreshCw /> {verifying ? "A verificar…" : "Verificar"}
            </Button>
          </form>

          <form action={toggleDomainAction}>
            <input type="hidden" name="id" value={domain.id} />
            <input
              type="hidden"
              name="next"
              value={domain.isActive ? "false" : "true"}
            />
            <Button size="sm" variant="ghost" type="submit">
              <Power /> {domain.isActive ? "Desligar" : "Ligar"}
            </Button>
          </form>

          <form action={deleteDomainAction} className="ml-auto">
            <input type="hidden" name="id" value={domain.id} />
            <Button
              size="sm"
              variant="ghost"
              type="submit"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 /> Remover
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
