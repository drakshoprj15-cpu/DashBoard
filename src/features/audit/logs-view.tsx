"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, FileClock, Webhook, XCircle } from "lucide-react";

import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
} from "@/features/dashboard/period";
import type {
  AuditLogRow,
  AuditSummary,
  ReceivedWebhookRow,
} from "@/features/audit/queries";
import { actionLabel, entityTypeLabel } from "@/features/audit/action-labels";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

type Tab = "admin" | "webhooks";

interface AuditResponse {
  adminLogs: AuditLogRow[];
  webhooks: ReceivedWebhookRow[];
  summary: AuditSummary;
}

function formatChanges(changes: Record<string, unknown>): string {
  const entries = Object.entries(changes).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(" · ");
}

export function LogsView() {
  const [period, setPeriod] = React.useState<DashboardPeriod>("30d");
  const [tab, setTab] = React.useState<Tab>("admin");
  const [data, setData] = React.useState<AuditResponse | null>(null);
  const [status, setStatus] = React.useState<"loading" | "success" | "error" | "empty">(
    "loading",
  );

  React.useEffect(() => {
    let active = true;

    async function fetchData() {
      if (active) setStatus("loading");
      try {
        const res = await fetch(`/api/audit?period=${period}`, { cache: "no-store" });
        if (!active) return;
        if (res.status === 503) {
          setData(null);
          setStatus("empty");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as AuditResponse;
        if (!active) return;
        setData(json);
        setStatus("success");
      } catch {
        if (active) setStatus("error");
      }
    }

    fetchData();
    return () => {
      active = false;
    };
  }, [period]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Selecionar seção"
          className="border-border bg-card inline-flex items-center gap-0.5 rounded-lg border p-0.5"
        >
          {(
            [
              { key: "admin" as const, label: "Ações administrativas", icon: FileClock },
              { key: "webhooks" as const, label: "Webhooks recebidos", icon: Webhook },
            ]
          ).map((t) => (
            <Button
              key={t.key}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "h-7 px-2.5 text-xs font-medium",
                tab === t.key
                  ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              <t.icon className="size-3.5" aria-hidden="true" />
              {t.label}
            </Button>
          ))}
        </div>

        <div
          role="group"
          aria-label="Selecionar período"
          className="border-border bg-card inline-flex items-center gap-0.5 rounded-lg border p-0.5"
        >
          {DASHBOARD_PERIODS.map((p) => (
            <Button
              key={p.value}
              type="button"
              size="sm"
              variant="ghost"
              aria-pressed={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "h-7 px-2.5 text-xs font-medium",
                period === p.value
                  ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                  : "text-muted-foreground",
              )}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {status === "loading" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[80px]" />
            ))}
          </div>
          <Skeleton className="h-[320px]" />
        </div>
      )}

      {status === "error" && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>Não foi possível carregar os logs. Tente novamente.</AlertDescription>
        </Alert>
      )}

      {status === "empty" && (
        <Alert>
          <AlertCircle />
          <AlertDescription>Configure o Supabase para acompanhar os logs da operação.</AlertDescription>
        </Alert>
      )}

      {status === "success" && data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-xs">Ações administrativas</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-lg font-bold tracking-tight">
                  {formatNumber(data.summary.adminActionsCount)}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-xs">Webhooks recebidos</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p className="text-lg font-bold tracking-tight">
                  {formatNumber(data.summary.webhooksCount)}
                </p>
              </CardContent>
            </Card>
            <Card className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="text-xs">Webhooks com erro</CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p
                  className={cn(
                    "text-lg font-bold tracking-tight",
                    data.summary.webhookErrorsCount > 0 && "text-destructive",
                  )}
                >
                  {formatNumber(data.summary.webhookErrorsCount)}
                </p>
              </CardContent>
            </Card>
          </div>

          {tab === "admin" && (
            <Card>
              <CardContent className={data.adminLogs.length === 0 ? "" : "p-0 pt-4 sm:p-6 sm:pt-6"}>
                {data.adminLogs.length === 0 ? (
                  <EmptyState
                    icon={FileClock}
                    title="Sem ações administrativas no período"
                    description="Criar, editar ou remover produtos, estoque, checkouts e lançamentos financeiros aparece aqui."
                    className="min-h-[280px]"
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-left text-xs">
                          <th scope="col" className="pr-3 pb-2.5 font-medium">Ação</th>
                          <th scope="col" className="pr-3 pb-2.5 font-medium">Entidade</th>
                          <th scope="col" className="pr-3 pb-2.5 font-medium">Detalhes</th>
                          <th scope="col" className="pb-2.5 font-medium">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.adminLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-muted/40 border-b transition-colors last:border-0">
                            <td className="py-3 pr-3 font-medium whitespace-nowrap">
                              {actionLabel(log.action)}
                            </td>
                            <td className="text-muted-foreground py-3 pr-3 whitespace-nowrap">
                              {entityTypeLabel(log.entityType)}
                            </td>
                            <td className="text-muted-foreground max-w-[360px] truncate py-3 pr-3 text-xs">
                              {formatChanges(log.changes)}
                            </td>
                            <td className="text-muted-foreground py-3 text-xs whitespace-nowrap">
                              {formatDateTime(log.createdAt, "pt-PT")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tab === "webhooks" && (
            <Card>
              <CardContent className={data.webhooks.length === 0 ? "" : "p-0 pt-4 sm:p-6 sm:pt-6"}>
                {data.webhooks.length === 0 ? (
                  <EmptyState
                    icon={Webhook}
                    title="Sem webhooks recebidos no período"
                    description="Eventos do gateway de pagamento (Broski) aparecem aqui assim que forem processados."
                    className="min-h-[280px]"
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-left text-xs">
                          <th scope="col" className="pr-3 pb-2.5 font-medium">Origem</th>
                          <th scope="col" className="pr-3 pb-2.5 font-medium">Evento</th>
                          <th scope="col" className="pr-3 pb-2.5 font-medium">Assinatura</th>
                          <th scope="col" className="pr-3 pb-2.5 font-medium">Estado</th>
                          <th scope="col" className="pb-2.5 font-medium">Recebido em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.webhooks.map((w) => (
                          <tr key={w.id} className="hover:bg-muted/40 border-b transition-colors last:border-0">
                            <td className="py-3 pr-3 font-medium whitespace-nowrap capitalize">
                              {w.providerKey}
                            </td>
                            <td className="text-muted-foreground py-3 pr-3 font-mono text-xs whitespace-nowrap">
                              {w.eventType}
                            </td>
                            <td className="py-3 pr-3">
                              {w.signatureValid ? (
                                <span className="text-success flex items-center gap-1 text-xs">
                                  <CheckCircle2 className="size-3.5" aria-hidden="true" /> Válida
                                </span>
                              ) : (
                                <span className="text-destructive flex items-center gap-1 text-xs">
                                  <XCircle className="size-3.5" aria-hidden="true" /> Inválida
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              {w.processingError ? (
                                <Badge variant="destructive">Erro</Badge>
                              ) : w.processedAt ? (
                                <Badge variant="success">Processado</Badge>
                              ) : (
                                <Badge variant="muted">Pendente</Badge>
                              )}
                            </td>
                            <td className="text-muted-foreground py-3 text-xs whitespace-nowrap">
                              {formatDateTime(w.createdAt, "pt-PT")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
