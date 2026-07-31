"use client";

import * as React from "react";
import { AlertCircle, Search, Webhook as WebhookIcon } from "lucide-react";

import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WebhookEndpointRow } from "@/features/webhooks/queries";
import { WebhookCard } from "@/features/webhooks/webhook-card";
import { WebhookEndpointSheet } from "@/features/webhooks/webhook-endpoint-sheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type FilterOption = "all" | "active" | "inactive" | "error";
type SortOption = "recent" | "oldest" | "name";

interface BroskiInboundInfo {
  configured: boolean;
  eventsReceived: number;
  lastEventAt: string | null;
}

interface WebhooksResponse {
  endpoints: WebhookEndpointRow[];
  broskiInbound: BroskiInboundInfo;
}

function BroskiInboundCard({ info }: { info: BroskiInboundInfo }) {
  return (
    <Card className="border-primary/20">
      <CardContent className="px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <WebhookIcon className="size-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">Broski (entrada)</p>
                <Badge variant={info.configured ? "success" : "muted"}>
                  {info.configured ? "Ativo" : "Não configurado"}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                /api/webhooks/broski
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Recebe eventos de pagamento do gateway — registado no painel da Broski, não editável aqui.
              </p>
            </div>
          </div>
          <div className="text-muted-foreground text-right text-xs">
            <p>{formatNumber(info.eventsReceived)} evento(s) recebido(s)</p>
            <p>
              Última chamada:{" "}
              {info.lastEventAt ? formatDateTime(new Date(info.lastEventAt), "pt-PT") : "nunca"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function WebhooksView() {
  const [data, setData] = React.useState<WebhooksResponse | null>(null);
  const [status, setStatus] = React.useState<"loading" | "success" | "error" | "empty">(
    "loading",
  );
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterOption>("all");
  const [sort, setSort] = React.useState<SortOption>("recent");

  React.useEffect(() => {
    let active = true;

    async function fetchData() {
      if (active) setStatus("loading");
      try {
        const res = await fetch("/api/webhooks-config", { cache: "no-store" });
        if (!active) return;
        if (res.status === 503) {
          setData(null);
          setStatus("empty");
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as WebhooksResponse;
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
  }, []);

  const filtered = React.useMemo(() => {
    if (!data) return [];
    let list = data.endpoints;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || e.url.toLowerCase().includes(q),
      );
    }

    if (filter === "active") list = list.filter((e) => e.isActive);
    else if (filter === "inactive") list = list.filter((e) => !e.isActive);
    else if (filter === "error") list = list.filter((e) => e.failureCount > 0);

    const sorted = [...list];
    if (sort === "recent") {
      sorted.sort((a, b) => b.createdAt.valueOf() - a.createdAt.valueOf());
    } else if (sort === "oldest") {
      sorted.sort((a, b) => a.createdAt.valueOf() - b.createdAt.valueOf());
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [data, search, filter, sort]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Webhooks</h2>
          <p className="text-muted-foreground text-sm">
            Gerencie todas as integrações em tempo real da sua loja
          </p>
        </div>
        <WebhookEndpointSheet />
      </div>

      {status === "loading" && (
        <div className="space-y-3">
          <Skeleton className="h-[88px]" />
          <Skeleton className="h-[140px]" />
          <Skeleton className="h-[140px]" />
        </div>
      )}

      {status === "error" && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>Não foi possível carregar os webhooks. Tente novamente.</AlertDescription>
        </Alert>
      )}

      {status === "empty" && (
        <Alert>
          <AlertCircle />
          <AlertDescription>Configure o Supabase para gerir webhooks.</AlertDescription>
        </Alert>
      )}

      {status === "success" && data && (
        <>
          <BroskiInboundCard info={data.broskiInbound} />

          {data.endpoints.length === 0 ? (
            <EmptyState
              icon={WebhookIcon}
              title="Você ainda não possui Webhooks"
              description="Crie o seu primeiro webhook para integrar o Infinity com qualquer plataforma."
              action={<WebhookEndpointSheet />}
              className="min-h-[320px]"
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Pesquisar webhook…"
                    className="pl-8"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Filtrar por estado"
                  className="border-border bg-card inline-flex items-center gap-0.5 rounded-lg border p-0.5"
                >
                  {(
                    [
                      { value: "all" as const, label: "Todos" },
                      { value: "active" as const, label: "Ativos" },
                      { value: "inactive" as const, label: "Inativos" },
                      { value: "error" as const, label: "Erro" },
                    ]
                  ).map((f) => (
                    <Button
                      key={f.value}
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-pressed={filter === f.value}
                      onClick={() => setFilter(f.value)}
                      className={cn(
                        "h-7 px-2.5 text-xs font-medium",
                        filter === f.value
                          ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>

                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortOption)}
                  aria-label="Ordenar"
                  className="border-input bg-card h-8 rounded-md border px-2 text-xs shadow-xs outline-none"
                >
                  <option value="recent">Mais recentes</option>
                  <option value="oldest">Mais antigos</option>
                  <option value="name">Nome</option>
                </select>
              </div>

              {filtered.length === 0 ? (
                <p className="text-muted-foreground py-10 text-center text-sm">
                  Nenhum webhook corresponde à pesquisa/filtro.
                </p>
              ) : (
                <div className="space-y-3">
                  {filtered.map((endpoint) => (
                    <WebhookCard key={endpoint.id} endpoint={endpoint} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
