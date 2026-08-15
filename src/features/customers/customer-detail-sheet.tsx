"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ClipboardList,
  Mail,
  MapPin,
  MessageCircle,
  NotebookPen,
  Package2,
  ShoppingCart,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { formatDateTime, formatMoney } from "@/lib/format";
import { addCustomerNoteAction } from "@/features/customers/actions";
import type { CustomerDetail } from "@/features/customers/types";
import { activityLabel } from "@/features/customers/customer-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CustomerDetailSheetProps {
  customerId: string | null;
  onOpenChange: (open: boolean) => void;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="gap-1 py-3 shadow-none">
      <CardContent className="px-3">
        <p className="text-muted-foreground text-[11px]">{label}</p>
        <p className="mt-0.5 text-sm font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function whatsappUrl(phone: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}

async function fetchCustomerDetail(id: string, signal?: AbortSignal) {
  const response = await fetch(`/api/customers/${id}`, {
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as CustomerDetail;
}

export function CustomerDetailSheet({
  customerId,
  onOpenChange,
}: CustomerDetailSheetProps) {
  const [loadedDetail, setLoadedDetail] = React.useState<CustomerDetail | null>(
    null,
  );
  const [errorFor, setErrorFor] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [savingNote, startSavingNote] = React.useTransition();

  React.useEffect(() => {
    if (!customerId) return;
    const controller = new AbortController();
    async function run() {
      try {
        const nextDetail = await fetchCustomerDetail(
          customerId as string,
          controller.signal,
        );
        setLoadedDetail(nextDetail);
        setErrorFor(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setErrorFor(customerId);
      }
    }
    void run();
    return () => controller.abort();
  }, [customerId]);

  const detail = loadedDetail?.id === customerId ? loadedDetail : null;

  async function retryLoad() {
    if (!customerId) return;
    setErrorFor(null);
    try {
      setLoadedDetail(await fetchCustomerDetail(customerId));
    } catch {
      setErrorFor(customerId);
    }
  }

  function submitNote() {
    if (!customerId || !note.trim()) return;
    startSavingNote(async () => {
      const result = await addCustomerNoteAction(customerId, note);
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar a observação.");
        return;
      }
      toast.success(result.message);
      setNote("");
      setLoadedDetail(await fetchCustomerDetail(customerId));
    });
  }

  const whatsapp = whatsappUrl(detail?.phone ?? null);

  return (
    <Sheet open={Boolean(customerId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="border-b pr-12">
          {detail ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <SheetTitle className="text-lg">{detail.name}</SheetTitle>
                  <SheetDescription className="mt-1">
                    Primeiro contato em {formatDateTime(detail.createdAt)}
                  </SheetDescription>
                </div>
                <div className="flex flex-wrap gap-1">
                  {detail.statuses.map((item) => (
                    <Badge key={item.key} variant="outline">
                      {item.label}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/emails?recipients=${detail.id}`}>
                    <Mail /> Enviar e-mail
                  </Link>
                </Button>
                {whatsapp && (
                  <Button asChild size="sm" variant="outline">
                    <a href={whatsapp} target="_blank" rel="noreferrer">
                      <MessageCircle /> WhatsApp
                    </a>
                  </Button>
                )}
                <Button asChild size="sm" variant="outline">
                  <Link href={`/pedidos?customerId=${detail.id}`}>
                    <ClipboardList /> Ver pedidos
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <>
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-40" />
            </>
          )}
        </SheetHeader>

        {!detail && errorFor !== customerId && (
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-16" />
              ))}
            </div>
            <Skeleton className="h-72" />
          </div>
        )}
        {errorFor === customerId && (
          <div className="p-6 text-center">
            <p className="text-sm font-medium">
              Não foi possível carregar o cliente.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void retryLoad()}
            >
              Tentar novamente
            </Button>
          </div>
        )}
        {detail && (
          <div className="p-4">
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                label="Total gasto"
                value={formatMoney(detail.totalSpentCents, detail.currency)}
              />
              <Metric
                label="Ticket médio"
                value={formatMoney(detail.averageTicketCents, detail.currency)}
              />
              <Metric label="Pedidos" value={detail.orderCount} />
              <Metric label="Pedidos pagos" value={detail.paidCount} />
            </div>

            <Tabs defaultValue="overview">
              <div className="overflow-x-auto pb-1">
                <TabsList className="min-w-max">
                  <TabsTrigger value="overview">
                    <UserRound /> Visão geral
                  </TabsTrigger>
                  <TabsTrigger value="orders">
                    <ClipboardList /> Pedidos
                  </TabsTrigger>
                  <TabsTrigger value="carts">
                    <ShoppingCart /> Carrinhos
                  </TabsTrigger>
                  <TabsTrigger value="activity">
                    <Activity /> Atividades
                  </TabsTrigger>
                  <TabsTrigger value="communications">
                    <Mail /> Comunicações
                  </TabsTrigger>
                  <TabsTrigger value="data">
                    <MapPin /> Dados
                  </TabsTrigger>
                  <TabsTrigger value="notes">
                    <NotebookPen /> Observações
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="overview" className="space-y-4 pt-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Pendentes" value={detail.pendingCount} />
                  <Metric label="Recusados" value={detail.refusedCount} />
                  <Metric
                    label="Carrinhos abandonados"
                    value={detail.abandonedCarts}
                  />
                </div>
                <div className="rounded-lg border p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 font-medium">
                      <Package2 className="text-primary size-4" /> Produto
                    </p>
                    {detail.productSource !== "missing" && (
                      <Badge variant="outline" className="text-[10px]">
                        {detail.productSource === "order"
                          ? "Confirmado pelo pedido"
                          : "Informado na importação"}
                      </Badge>
                    )}
                  </div>
                  {detail.productNames.length > 0 ? (
                    <p className="mt-2 font-semibold">
                      {detail.productNames.join(" · ")}
                    </p>
                  ) : (
                    <p className="text-muted-foreground mt-2">
                      Produto não informado. Reimporte este contato com a coluna
                      Produto ou escolha um produto padrão.
                    </p>
                  )}
                </div>
                <div className="rounded-lg border p-4 text-sm">
                  <p className="font-medium">Contato</p>
                  <p className="text-muted-foreground mt-2">{detail.email}</p>
                  <p className="text-muted-foreground">
                    {detail.phone ?? "Telefone não informado"}
                  </p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    Origem: {detail.source} · Última atividade{" "}
                    {formatDateTime(detail.lastActivityAt)}
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="orders" className="space-y-2 pt-3">
                {detail.orders.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    Nenhum pedido.
                  </p>
                ) : (
                  detail.orders.map((order) => (
                    <div
                      key={order.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {order.reference} · {order.product}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatDateTime(order.createdAt)} · {order.status}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">
                        {formatMoney(order.valueCents, order.currency)}
                      </p>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="carts" className="space-y-2 pt-3">
                {detail.carts.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    Nenhum carrinho.
                  </p>
                ) : (
                  detail.carts.map((cart) => (
                    <div
                      key={cart.id}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium capitalize">{cart.status}</p>
                        <p className="text-muted-foreground text-xs">
                          {cart.abandonedAt
                            ? `Abandonado em ${formatDateTime(cart.abandonedAt)}`
                            : "Checkout em andamento"}
                        </p>
                      </div>
                      <p className="font-semibold">
                        {formatMoney(cart.valueCents, cart.currency)}
                      </p>
                    </div>
                  ))
                )}
              </TabsContent>

              <TabsContent value="activity" className="pt-3">
                <ol className="space-y-0">
                  {detail.activities.map((activity, index) => (
                    <li key={activity.id} className="relative flex gap-3 pb-5">
                      {index < detail.activities.length - 1 && (
                        <span className="bg-border absolute top-3 bottom-0 left-[5px] w-px" />
                      )}
                      <span className="bg-primary relative mt-2 size-2.5 shrink-0 rounded-full" />
                      <div>
                        <p className="text-sm font-medium">
                          {activityLabel(activity.type)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {activity.description}
                        </p>
                        <p className="text-muted-foreground mt-1 text-[11px]">
                          {formatDateTime(activity.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </TabsContent>

              <TabsContent value="communications" className="space-y-4 pt-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Metric label="Enviados" value={detail.communications.sent} />
                  <Metric
                    label="Entregues"
                    value={detail.communications.delivered}
                  />
                  <Metric
                    label="Aberturas"
                    value={detail.communications.opened}
                  />
                  <Metric
                    label="Cliques"
                    value={detail.communications.clicked}
                  />
                  <Metric label="Falhas" value={detail.communications.failed} />
                  <Metric
                    label="Descadastros"
                    value={detail.communications.unsubscribed}
                  />
                </div>
                <div className="rounded-lg border p-4 text-sm">
                  <p className="font-medium">Campanhas relacionadas</p>
                  <p className="text-muted-foreground mt-2">
                    {detail.communications.campaigns.length > 0
                      ? detail.communications.campaigns.join(" · ")
                      : "Nenhuma campanha registrada para este cliente."}
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="data" className="pt-3">
                <dl className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground text-xs">Nome</dt>
                    <dd>{detail.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Documento</dt>
                    <dd>{detail.documentMasked ?? "Não informado"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">E-mail</dt>
                    <dd className="break-all">{detail.email}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Telefone</dt>
                    <dd>{detail.phone ?? "Não informado"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Cidade/estado
                    </dt>
                    <dd>
                      {[detail.city, detail.state]
                        .filter(Boolean)
                        .join(" / ") || "Não informado"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">País</dt>
                    <dd>{detail.country ?? "Não informado"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground text-xs">Endereço</dt>
                    <dd>
                      {detail.address
                        ? [
                            detail.address.street,
                            detail.address.number,
                            detail.address.complement,
                            detail.address.postalCode,
                          ]
                            .filter(Boolean)
                            .join(", ")
                        : "Não informado"}
                    </dd>
                  </div>
                </dl>
              </TabsContent>

              <TabsContent value="notes" className="space-y-4 pt-3">
                <div className="space-y-2 rounded-lg border p-3">
                  <label
                    htmlFor="customer-note"
                    className="text-sm font-medium"
                  >
                    Nova observação
                  </label>
                  <textarea
                    id="customer-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Informação interna sobre este cliente..."
                    maxLength={4000}
                    rows={3}
                    className="border-input bg-background w-full resize-y rounded-md border p-2 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingNote || !note.trim()}
                      onClick={submitNote}
                    >
                      {savingNote ? "Salvando..." : "Adicionar observação"}
                    </Button>
                  </div>
                </div>
                {detail.notes.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 text-sm">
                    <p className="whitespace-pre-wrap">{item.content}</p>
                    <p className="text-muted-foreground mt-2 text-xs">
                      {item.author ?? "Sistema"} ·{" "}
                      {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
