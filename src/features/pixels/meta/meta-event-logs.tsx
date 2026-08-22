import Link from "next/link";
import { Eye, History, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listAllPixelsForFilter,
  listPixelEvents,
} from "@/features/pixels/queries";
import { reprocessPixelEventAction } from "@/features/pixels/actions";
import type { LandingPagePickerItem } from "./landing-page-selector";

const EVENT_NAME_OPTIONS = [
  "Purchase",
  "InitiateCheckout",
  "ViewContent",
  "PageView",
];
const STATUS_OPTIONS = [
  { value: "sent", label: "Enviado" },
  { value: "processing", label: "Processando" },
  { value: "pending", label: "Pendente" },
  { value: "failed", label: "Falhou" },
];
const STATUS_BADGE: Record<
  string,
  "success" | "info" | "destructive" | "muted"
> = {
  sent: "success",
  processing: "info",
  pending: "info",
  failed: "destructive",
};
const TRIGGER_LABEL: Record<string, string> = {
  generated_order: "Pedido gerado",
  payment_approved: "Pagamento aprovado",
  reprocess: "Reprocessamento",
  test: "Teste",
  browser: "Navegador",
};

function asString(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

interface MetaEventLogsProps {
  searchParams: Record<string, string | string[] | undefined>;
  landingPages: LandingPagePickerItem[];
  workspaceId: string;
}

export async function MetaEventLogs({
  searchParams,
  landingPages,
  workspaceId,
}: MetaEventLogsProps) {
  const page = Math.max(1, Number(asString(searchParams.logPage)) || 1);
  const filters = {
    page,
    pageSize: 20,
    landingPageId: asString(searchParams.logLandingPageId) || undefined,
    pixelId: asString(searchParams.logPixelId) || undefined,
    eventName: asString(searchParams.logEventName) || undefined,
    status: asString(searchParams.logStatus) || undefined,
    q: asString(searchParams.logQ) || undefined,
  };

  const [{ rows, total, pageSize }, pixelOptions] = await Promise.all([
    listPixelEvents(filters, workspaceId),
    listAllPixelsForFilter(workspaceId),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Preserva os demais parâmetros da URL (aba, landing page selecionada no
  // seletor acima) ao trocar página/filtro do log.
  const preservedLp = asString(searchParams.lp);

  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    params.set("tab", "meta");
    if (preservedLp) params.set("lp", preservedLp);
    if (filters.landingPageId)
      params.set("logLandingPageId", filters.landingPageId);
    if (filters.pixelId) params.set("logPixelId", filters.pixelId);
    if (filters.eventName) params.set("logEventName", filters.eventName);
    if (filters.status) params.set("logStatus", filters.status);
    if (filters.q) params.set("logQ", filters.q);
    params.set("logPage", String(targetPage));
    return `/pixel?${params.toString()}`;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Histórico de eventos da Meta
        </CardTitle>
        <CardDescription>
          Eventos enviados pelo Pixel e pela API de Conversões, com o disparo
          que originou cada envio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          method="GET"
          action="/pixel"
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="tab" value="meta" />
          {preservedLp ? (
            <input type="hidden" name="lp" value={preservedLp} />
          ) : null}

          <FilterSelect
            name="logLandingPageId"
            label="Landing page"
            value={filters.landingPageId ?? ""}
            options={landingPages.map((lp) => ({
              value: lp.id,
              label: lp.publicName || lp.name,
            }))}
          />
          <FilterSelect
            name="logPixelId"
            label="Pixel"
            value={filters.pixelId ?? ""}
            options={pixelOptions.map((p) => ({ value: p.id, label: p.name }))}
          />
          <FilterSelect
            name="logEventName"
            label="Evento"
            value={filters.eventName ?? ""}
            options={EVENT_NAME_OPTIONS.map((v) => ({ value: v, label: v }))}
          />
          <FilterSelect
            name="logStatus"
            label="Status"
            value={filters.status ?? ""}
            options={STATUS_OPTIONS}
          />
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Pedido</span>
            <input
              type="text"
              name="logQ"
              defaultValue={filters.q ?? ""}
              placeholder="Referência do pedido"
              className="border-input bg-card h-8 rounded-md border px-2 text-xs shadow-xs outline-none"
            />
          </label>

          <Button type="submit" size="sm" variant="outline">
            Filtrar
          </Button>
          {(filters.landingPageId ||
            filters.pixelId ||
            filters.eventName ||
            filters.status ||
            filters.q) && (
            <Link
              href={`/pixel?tab=meta${preservedLp ? `&lp=${preservedLp}` : ""}`}
              className="text-muted-foreground text-xs underline"
            >
              Limpar filtros
            </Link>
          )}
        </form>

        {rows.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nenhum evento encontrado"
            description="Os eventos enviados pelo Pixel e pela API de Conversões aparecerão aqui."
            className="min-h-[160px]"
          />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Landing page</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Pixel</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Disparo</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-xs">
                      {new Date(event.createdAt).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {event.landingPageName ?? "Global"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {event.orderReference ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">{event.pixelName}</TableCell>
                    <TableCell className="text-xs">{event.eventName}</TableCell>
                    <TableCell className="text-xs">
                      {TRIGGER_LABEL[event.triggerType ?? ""] ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs capitalize">
                      {event.channel === "server" ? "CAPI" : "Pixel"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[event.status] ?? "muted"}>
                        {STATUS_OPTIONS.find((s) => s.value === event.status)
                          ?.label ?? event.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {event.retryCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Ver resposta do evento"
                            >
                              <Eye />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Resposta do evento</DialogTitle>
                            </DialogHeader>
                            <pre className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-xs">
                              {JSON.stringify(
                                {
                                  status: event.status,
                                  httpStatus: event.httpStatus,
                                  errorCode: event.errorCode,
                                  error: event.error,
                                  response: event.response,
                                },
                                null,
                                2,
                              )}
                            </pre>
                          </DialogContent>
                        </Dialog>
                        {event.status === "failed" ? (
                          <form action={reprocessPixelEventAction}>
                            <input type="hidden" name="id" value={event.id} />
                            <Button
                              type="submit"
                              size="icon-sm"
                              variant="ghost"
                              aria-label="Reprocessar evento"
                            >
                              <RotateCcw />
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > pageSize ? (
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Página {page} de {pageCount} — {total} eventos
            </span>
            <div className="flex gap-2">
              {page <= 1 ? (
                <Button size="sm" variant="outline" disabled>
                  Anterior
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={pageHref(page - 1)}>Anterior</Link>
                </Button>
              )}
              {page >= pageCount ? (
                <Button size="sm" variant="outline" disabled>
                  Próxima
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={pageHref(page + 1)}>Próxima</Link>
                </Button>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="border-input bg-card h-8 rounded-md border px-2 text-xs shadow-xs outline-none"
      >
        <option value="">Todos</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
