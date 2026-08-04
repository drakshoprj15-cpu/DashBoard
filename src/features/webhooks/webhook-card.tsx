"use client";

import * as React from "react";
import {
  Copy,
  Files,
  FlaskConical,
  ListTree,
  Trash2,
  Webhook as WebhookIcon,
} from "lucide-react";

import { formatDateTime, formatNumber } from "@/lib/format";
import { eventLabel } from "@/features/webhooks/events-catalog";
import {
  deleteWebhookEndpointAction,
  duplicateWebhookEndpointAction,
  toggleWebhookEndpointAction,
} from "@/features/webhooks/actions";
import type { WebhookEndpointRow } from "@/features/webhooks/queries";
import { WebhookStatusBadge } from "@/features/webhooks/webhook-status-badge";
import { WebhookEndpointSheet } from "@/features/webhooks/webhook-endpoint-sheet";
import { WebhookTestModal } from "@/features/webhooks/webhook-test-modal";
import { WebhookLogsSheet } from "@/features/webhooks/webhook-logs-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function WebhookCard({ endpoint }: { endpoint: WebhookEndpointRow }) {
  const [copied, setCopied] = React.useState(false);

  async function copyUrl() {
    await navigator.clipboard.writeText(endpoint.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card className="hover:border-primary/30 gap-3 py-4 transition-colors">
      <CardContent className="px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <WebhookIcon className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold">{endpoint.name}</p>
                <WebhookStatusBadge isActive={endpoint.isActive} />
              </div>
              <button
                type="button"
                onClick={copyUrl}
                className="text-muted-foreground hover:text-foreground mt-0.5 flex items-center gap-1 truncate font-mono text-xs transition-colors"
              >
                <Copy className="size-3 shrink-0" aria-hidden="true" />
                {copied ? "Copiado!" : endpoint.url}
              </button>
              <div className="mt-2 flex flex-wrap gap-1">
                {endpoint.events.slice(0, 4).map((key) => (
                  <Badge key={key} variant="muted" className="text-[10px]">
                    {eventLabel(key)}
                  </Badge>
                ))}
                {endpoint.events.length > 4 && (
                  <Badge variant="muted" className="text-[10px]">
                    +{endpoint.events.length - 4}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <WebhookTestModal endpoint={endpoint} />
            <WebhookLogsSheet
              endpoint={endpoint}
              trigger={
                <Button size="sm" variant="outline">
                  <ListTree /> Logs
                </Button>
              }
            />
            <WebhookEndpointSheet
              endpoint={endpoint}
              trigger={
                <Button size="sm" variant="outline">
                  Editar
                </Button>
              }
            />
            <form action={duplicateWebhookEndpointAction}>
              <input type="hidden" name="id" value={endpoint.id} />
              <Button
                size="sm"
                variant="ghost"
                type="submit"
                aria-label="Duplicar"
              >
                <Files />
              </Button>
            </form>
            <form action={toggleWebhookEndpointAction}>
              <input type="hidden" name="id" value={endpoint.id} />
              <input
                type="hidden"
                name="activate"
                value={(!endpoint.isActive).toString()}
              />
              <Button size="sm" variant="ghost" type="submit">
                {endpoint.isActive ? "Pausar" : "Ativar"}
              </Button>
            </form>
            <form action={deleteWebhookEndpointAction}>
              <input type="hidden" name="id" value={endpoint.id} />
              <Button
                size="sm"
                variant="ghost"
                type="submit"
                aria-label="Excluir"
                className="text-destructive hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </form>
          </div>
        </div>

        <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs">
          <span className="flex items-center gap-1">
            <FlaskConical className="size-3.5" aria-hidden="true" />
            {formatNumber(endpoint.deliveriesCount)} chamada(s)
          </span>
          <span className="text-success">
            {formatNumber(endpoint.successCount)} com sucesso
          </span>
          {endpoint.failureCount > 0 && (
            <span className="text-destructive">
              {formatNumber(endpoint.failureCount)} com falha
            </span>
          )}
          <span>
            Última execução:{" "}
            {endpoint.lastDeliveryAt
              ? formatDateTime(endpoint.lastDeliveryAt, "pt-PT")
              : "nunca"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
