"use client";

import * as React from "react";
import {
  Activity,
  CreditCard,
  Eye,
  Globe,
  Laptop,
  MousePointerClick,
  Smartphone,
  Tablet,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { LiveSnapshot } from "@/features/analytics/live-queries";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const POLL_MS = 5000;

const EVENT_LABEL: Record<string, string> = {
  page_view: "Entrou na página",
  view_content: "Visualizou o produto",
  click_buy: "Clicou em comprar",
  checkout_opened: "Abriu o checkout",
  checkout_contact_filled: "Preencheu o contacto",
  checkout_payment_selected: "Escolheu o pagamento",
  payment_created: "Gerou o pagamento",
};

const EVENT_ICON: Record<string, React.ElementType> = {
  page_view: Eye,
  view_content: Eye,
  click_buy: MousePointerClick,
  checkout_opened: CreditCard,
  checkout_contact_filled: CreditCard,
  checkout_payment_selected: CreditCard,
  payment_created: CreditCard,
};

const EVENT_TONE: Record<string, string> = {
  page_view: "text-muted-foreground",
  view_content: "text-info",
  click_buy: "text-warning",
  checkout_opened: "text-primary",
  checkout_contact_filled: "text-primary",
  checkout_payment_selected: "text-primary",
  payment_created: "text-success",
};

function DeviceIcon({ type }: { type: string | null }) {
  const Icon = type === "mobile" ? Smartphone : type === "tablet" ? Tablet : Laptop;
  return <Icon className="size-3.5 shrink-0" />;
}

function timeAgo(date: string | Date): string {
  const diff = Math.max(0, Date.now() - new Date(date).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  return `há ${Math.floor(m / 60)}h`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}min ${s}s`;
}

type ConnState = "connected" | "reconnecting" | "disconnected";

export function LiveView() {
  const [data, setData] = React.useState<LiveSnapshot | null>(null);
  const [conn, setConn] = React.useState<ConnState>("reconnecting");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    let failures = 0;

    async function poll() {
      try {
        const res = await fetch("/api/painel-ao-vivo", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as LiveSnapshot;
        if (!active) return;
        setData(json);
        setConn("connected");
        failures = 0;
      } catch {
        if (!active) return;
        failures += 1;
        setConn(failures > 2 ? "disconnected" : "reconnecting");
      } finally {
        if (active) setLoading(false);
      }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const cards = [
    { label: "Online agora", value: data?.onlineNow ?? 0, icon: Users, live: true },
    { label: "Visitantes hoje", value: data?.visitorsToday ?? 0, icon: Activity },
    { label: "Visitantes 24h", value: data?.visitors24h ?? 0, icon: Globe },
    { label: "Páginas vistas hoje", value: data?.pageViewsToday ?? 0, icon: Eye },
  ];

  const funnelMax = Math.max(1, ...(data?.funnel.map((f) => f.count) ?? [1]));

  return (
    <div className="space-y-5">
      {/* Status da ligação */}
      <div className="flex items-center gap-2 text-xs">
        {conn === "connected" ? (
          <>
            <span className="bg-success size-2 animate-pulse rounded-full" />
            <span className="text-muted-foreground">
              Ao vivo · atualiza a cada 5s
            </span>
          </>
        ) : conn === "reconnecting" ? (
          <>
            <Wifi className="text-warning size-3.5" />
            <span className="text-muted-foreground">A reconectar…</span>
          </>
        ) : (
          <>
            <WifiOff className="text-destructive size-3.5" />
            <span className="text-destructive">Desligado</span>
          </>
        )}
      </div>

      {/* Cartões */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="gap-2 py-4">
              <CardHeader className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Icon className="size-3.5" />
                  {c.label}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4">
                <p
                  className={cn(
                    "text-2xl font-bold tracking-tight",
                    c.live && (c.value > 0 ? "text-success" : "text-muted-foreground"),
                  )}
                >
                  {c.value}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Funil */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funil das últimas 24 horas</CardTitle>
          <CardDescription>
            Sessões únicas que chegaram a cada etapa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {data?.funnel.map((step, i) => {
            const prev = i > 0 ? data.funnel[i - 1].count : null;
            const rate =
              prev && prev > 0 ? Math.round((step.count / prev) * 100) : null;
            return (
              <div key={step.event} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{step.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-bold">{step.count}</span>
                    {rate !== null && (
                      <Badge variant={rate >= 50 ? "success" : rate >= 20 ? "warning" : "muted"}>
                        {rate}%
                      </Badge>
                    )}
                  </span>
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${Math.max(2, (step.count / funnelMax) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Sessões ativas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pessoas online agora</CardTitle>
            <CardDescription>
              Sessões anónimas com atividade nos últimos 5 minutos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.sessions.length ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                Ninguém online neste momento.
                <br />
                <span className="text-xs">
                  Abra a sua landing page noutro separador para ver aparecer aqui.
                </span>
              </p>
            ) : (
              <div className="space-y-2">
                {data.sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <span className="bg-success size-2 shrink-0 animate-pulse rounded-full" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {s.currentPage ?? "—"}
                      </p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                        <span className="flex items-center gap-1">
                          <DeviceIcon type={s.deviceType} />
                          {s.browser}
                        </span>
                        <span>·</span>
                        <span>{s.countryCode ?? "??"}{s.city ? ` · ${s.city}` : ""}</span>
                        <span>·</span>
                        <span>{formatDuration(s.durationSeconds)}</span>
                        {s.utmSource && (
                          <>
                            <span>·</span>
                            <Badge variant="info" className="text-[10px]">
                              {s.utmSource}
                            </Badge>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                      {s.anonymousId.slice(0, 6)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Feed de eventos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feed de eventos</CardTitle>
            <CardDescription>Últimas ações dos visitantes</CardDescription>
          </CardHeader>
          <CardContent>
            {!data?.events.length ? (
              <p className="text-muted-foreground py-10 text-center text-sm">
                Ainda sem eventos registados.
              </p>
            ) : (
              <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
                {data.events.map((e) => {
                  const Icon = EVENT_ICON[e.eventName] ?? Activity;
                  return (
                    <div
                      key={e.id}
                      className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm"
                    >
                      <Icon
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          EVENT_TONE[e.eventName] ?? "text-muted-foreground",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {EVENT_LABEL[e.eventName] ?? e.eventName}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {e.page ?? ""}
                          {e.countryCode ? ` · ${e.countryCode}` : ""}
                        </p>
                      </div>
                      <span className="text-muted-foreground shrink-0 text-[11px]">
                        {timeAgo(e.occurredAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
