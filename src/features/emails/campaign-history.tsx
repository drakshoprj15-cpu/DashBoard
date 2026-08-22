"use client";

import * as React from "react";
import { ChevronDown, Eye, EyeOff } from "lucide-react";

import type { EmailCampaignHistoryItem } from "@/features/emails/campaigns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-PT", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Lisbon",
  }).format(new Date(value));
}

function campaignStatus(campaign: EmailCampaignHistoryItem) {
  if (campaign.failed > 0) {
    return { label: "Com falhas", variant: "destructive" as const };
  }
  if (campaign.queued > 0) {
    return { label: "Processando", variant: "warning" as const };
  }
  return { label: "Concluído", variant: "success" as const };
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  return (
    <div className="min-w-0 p-3">
      <p className="text-muted-foreground text-[10px] font-semibold uppercase">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-bold tabular-nums",
          tone === "success" && "text-emerald-600",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function CampaignHistory({
  campaigns,
}: {
  campaigns: EmailCampaignHistoryItem[];
}) {
  const firstId = campaigns[0]?.id ?? null;
  const [openId, setOpenId] = React.useState<string | null>(firstId);
  const [previewIds, setPreviewIds] = React.useState<Set<string>>(
    () => new Set(firstId ? [firstId] : []),
  );

  function togglePreview(id: string) {
    setPreviewIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="space-y-3" aria-labelledby="recent-dispatches-title">
      <h3 id="recent-dispatches-title" className="text-base font-semibold">
        Últimos disparos
      </h3>

      {campaigns.length === 0 ? (
        <div className="text-muted-foreground rounded-md border px-4 py-8 text-center text-sm">
          O histórico aparecerá aqui depois do primeiro disparo.
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map((campaign) => {
            const expanded = openId === campaign.id;
            const previewVisible = previewIds.has(campaign.id);
            const status = campaignStatus(campaign);

            return (
              <article
                key={campaign.id}
                className="bg-card overflow-hidden rounded-md border"
              >
                <button
                  type="button"
                  className="hover:bg-muted/30 focus-visible:ring-ring flex w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  aria-expanded={expanded}
                  aria-controls={`campaign-${campaign.id}`}
                  onClick={() => setOpenId(expanded ? null : campaign.id)}
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {campaign.name}
                      </span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </span>
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {formatDate(campaign.sentAt ?? campaign.createdAt)} ·{" "}
                      {campaign.sent}/{campaign.total} enviados
                      {campaign.failed > 0
                        ? ` · ${campaign.failed} falhados`
                        : ""}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "text-muted-foreground size-4 shrink-0 transition-transform",
                      expanded && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>

                {expanded && (
                  <div
                    id={`campaign-${campaign.id}`}
                    className="space-y-4 border-t px-4 py-4"
                  >
                    <div className="divide-border grid grid-cols-2 overflow-hidden rounded-md border sm:grid-cols-4 sm:divide-x">
                      <StatCell label="Total" value={campaign.total} />
                      <StatCell
                        label="Enviados"
                        value={campaign.sent}
                        tone="success"
                      />
                      <StatCell
                        label="Falhados"
                        value={campaign.failed}
                        tone="danger"
                      />
                      <StatCell label="Em fila" value={campaign.queued} />
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm">
                        <span className="font-semibold">Assunto:</span>{" "}
                        {campaign.subject}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => togglePreview(campaign.id)}
                      >
                        {previewVisible ? <EyeOff /> : <Eye />}
                        {previewVisible ? "Ocultar email" : "Mostrar email"}
                      </Button>
                    </div>

                    {previewVisible && (
                      <div className="bg-muted/20 overflow-hidden rounded-md border">
                        <div className="text-muted-foreground border-b px-3 py-2 text-[11px] font-medium">
                          Email enviado (variáveis com dados de exemplo)
                        </div>
                        <iframe
                          title={`Prévia do disparo ${campaign.name}`}
                          srcDoc={campaign.previewHtml}
                          sandbox=""
                          className="h-[440px] w-full bg-white"
                        />
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
