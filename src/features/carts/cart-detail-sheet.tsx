"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Mail,
  MessageCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";

import { formatDateTime, formatMoney } from "@/lib/format";
import { maskDocument } from "@/lib/mask";
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  isConvertedCategory,
  isEmailableCategory,
  isRecoverableCategory,
} from "@/features/carts/status";
import { whatsAppUrl } from "@/features/carts/phone";
import type { CartDetailDTO } from "@/features/carts/client-types";
import { CartStatusBadge } from "@/features/carts/cart-status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

async function copyToClipboard(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  } catch {
    toast.error(`Não foi possível copiar ${label.toLowerCase()}.`);
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export interface CartDetailSheetProps {
  orderId: string | null;
  onClose: () => void;
  onSendReminder: (orderId: string) => void;
  onOpenWhatsApp: (orderId: string) => void;
  onMarkStatus: (
    orderId: string,
    mark: "recovered" | "refused" | "pending",
  ) => void;
  onArchive: (orderId: string, archived: boolean) => void;
  onSync: (orderId: string) => void;
  onCancel: (orderId: string) => void;
  syncing: boolean;
  /** Incrementa sempre que o pedido é sincronizado/alterado, para forçar recarregar. */
  refreshToken: number;
}

const CANCELLABLE = new Set(["awaiting_payment", "pending", "abandoned"]);

export function CartDetailSheet({
  orderId,
  onClose,
  onSendReminder,
  onOpenWhatsApp,
  onMarkStatus,
  onArchive,
  onSync,
  onCancel,
  syncing,
  refreshToken,
}: CartDetailSheetProps) {
  const [data, setData] = React.useState<CartDetailDTO | null>(null);
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [documentRevealed, setDocumentRevealed] = React.useState(false);

  // Reset síncrono durante a renderização (não em efeito) sempre que o
  // pedido aberto ou o token de atualização mudam — evita mostrar dados do
  // pedido anterior por um instante.
  const requestKey = `${orderId ?? ""}:${refreshToken}`;
  const [prevRequestKey, setPrevRequestKey] = React.useState(requestKey);
  if (requestKey !== prevRequestKey) {
    setPrevRequestKey(requestKey);
    setDocumentRevealed(false);
    if (!orderId) {
      setData(null);
      setStatus("idle");
    } else {
      setStatus("loading");
    }
  }

  React.useEffect(() => {
    if (!orderId) return;
    let active = true;

    fetch(`/api/carrinhos/${orderId}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<CartDetailDTO>;
      })
      .then((json) => {
        if (!active) return;
        setData(json);
        setStatus("success");
      })
      .catch(() => {
        if (active) setStatus("error");
      });

    return () => {
      active = false;
    };
  }, [orderId, refreshToken]);

  const open = Boolean(orderId);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Detalhes do checkout</SheetTitle>
          <SheetDescription>
            {data
              ? `Pedido ${data.order.reference}`
              : "Carregando informações do pedido…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 px-4 pb-6">
          {status === "loading" && (
            <div className="space-y-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {status === "error" && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>
                Não foi possível carregar os detalhes deste pedido.
              </AlertDescription>
            </Alert>
          )}

          {status === "success" && data && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <CartStatusBadge category={data.order.category} />
                <span className="text-muted-foreground text-xs">
                  Status original do pedido: {data.order.status}
                </span>
              </div>

              {/* Ações rápidas de recuperação */}
              <div className="flex flex-wrap gap-2">
                {isEmailableCategory(data.order.category) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onSendReminder(data.order.id)}
                  >
                    <Mail />{" "}
                    {isConvertedCategory(data.order.category)
                      ? "Enviar confirmação"
                      : "Enviar lembrete"}
                  </Button>
                )}
                {data.customer?.phone && whatsAppUrl(data.customer.phone) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={data.customer.marketingOptOut}
                    onClick={() => onOpenWhatsApp(data.order.id)}
                  >
                    <MessageCircle /> WhatsApp
                  </Button>
                )}
                {data.order.checkoutUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(
                        data.order.checkoutUrl!,
                        "Link do checkout",
                      )
                    }
                  >
                    <Link2 /> Copiar link
                  </Button>
                )}
                {data.order.category !== "paid" &&
                  data.order.category !== "recovered" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onMarkStatus(data.order.id, "recovered")}
                    >
                      <CheckCircle2 /> Marcar como convertido
                    </Button>
                  )}
                {isRecoverableCategory(data.order.category) &&
                  data.order.category !== "declined" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onMarkStatus(data.order.id, "refused")}
                    >
                      Marcar como recusado
                    </Button>
                  )}
                {(data.order.category === "awaiting_payment" ||
                  data.order.category === "abandoned") && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onMarkStatus(data.order.id, "pending")}
                  >
                    Marcar como pendente
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onArchive(data.order.id, !data.order.archivedAt)
                  }
                >
                  <Archive />{" "}
                  {data.order.archivedAt ? "Desarquivar" : "Arquivar"}
                </Button>
                {data.payments.some((p) => p.externalId) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={syncing}
                    onClick={() => onSync(data.order.id)}
                  >
                    <RefreshCw
                      className={syncing ? "animate-spin" : undefined}
                    />{" "}
                    Sincronizar status
                  </Button>
                )}
                {CANCELLABLE.has(data.order.category) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onCancel(data.order.id)}
                  >
                    <XCircle /> Cancelar pedido
                  </Button>
                )}
              </div>

              {data.order.lastReminderSentAt && (
                <p className="text-muted-foreground text-xs">
                  Último lembrete por{" "}
                  {data.order.lastReminderChannel === "whatsapp"
                    ? "WhatsApp"
                    : "e-mail"}{" "}
                  em {formatDateTime(data.order.lastReminderSentAt, "pt-PT")} ·{" "}
                  {data.order.reminderCount} no total.
                </p>
              )}

              <Separator />

              {/* Cliente */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Cliente</h3>
                {data.customer ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nome completo">{data.customer.name}</Field>
                    <Field label="País">{data.customer.country ?? "—"}</Field>
                    <Field label="E-mail">
                      <span className="flex items-center gap-1.5">
                        {data.customer.email}
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(data.customer!.email, "E-mail")
                          }
                          className="text-muted-foreground hover:text-foreground"
                          aria-label="Copiar e-mail"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </span>
                    </Field>
                    <Field label="Telefone">
                      {data.customer.phone ? (
                        <span className="flex items-center gap-1.5">
                          {data.customer.phone}
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(data.customer!.phone!, "Telefone")
                            }
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Copiar telefone"
                          >
                            <Copy className="size-3.5" />
                          </button>
                          {whatsAppUrl(data.customer.phone) && (
                            <a
                              href={whatsAppUrl(data.customer.phone)!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-success"
                              aria-label="Abrir no WhatsApp"
                            >
                              <MessageCircle className="size-3.5" />
                            </a>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Field>
                    <Field label="CPF/documento">
                      {data.customer.document ? (
                        <span className="flex items-center gap-1.5 font-mono">
                          {documentRevealed
                            ? data.customer.document
                            : maskDocument(data.customer.document)}
                          <button
                            type="button"
                            onClick={() => setDocumentRevealed((v) => !v)}
                            className="text-muted-foreground hover:text-foreground"
                            aria-label={
                              documentRevealed
                                ? "Ocultar documento"
                                : "Revelar documento"
                            }
                          >
                            {documentRevealed ? (
                              <EyeOff className="size-3.5" />
                            ) : (
                              <Eye className="size-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                data.customer!.document!,
                                "Documento",
                              )
                            }
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Copiar documento"
                          >
                            <Copy className="size-3.5" />
                          </button>
                        </span>
                      ) : (
                        "—"
                      )}
                    </Field>
                    <Field label="Comunicações">
                      <Badge
                        variant={
                          data.customer.marketingOptOut ? "muted" : "success"
                        }
                      >
                        {data.customer.marketingOptOut
                          ? "Descadastrado"
                          : "Autorizadas"}
                      </Badge>
                    </Field>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Nenhum cliente associado a este pedido.
                  </p>
                )}
              </section>

              <Separator />

              {/* Pedido */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Pedido</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Referência">{data.order.reference}</Field>
                  <Field label="Origem">
                    {data.order.origin === "import"
                      ? "Importado de planilha"
                      : (data.order.origin ?? "—")}
                  </Field>
                  {data.order.checkoutUrl && (
                    <Field label="Link do checkout">
                      <a
                        href={data.order.checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary break-all hover:underline"
                      >
                        {data.order.checkoutUrl}
                      </a>
                    </Field>
                  )}
                  {data.order.utm && Object.keys(data.order.utm).length > 0 && (
                    <Field label="Origem/UTM">
                      {Object.entries(data.order.utm).map(([key, value]) => (
                        <span key={key} className="block text-xs">
                          {key}: {String(value)}
                        </span>
                      ))}
                    </Field>
                  )}
                  <Field label="Produto(s)">
                    {data.items.map((i, index) => (
                      <span
                        key={`${i.productName}-${i.sku ?? index}`}
                        className="block"
                      >
                        {i.productName}
                        {i.variantName ? ` — ${i.variantName}` : ""} ×
                        {i.quantity} —{" "}
                        {formatMoney(
                          i.totalCents,
                          data.order.currency,
                          "pt-PT",
                        )}
                        {i.sku ? (
                          <span className="text-muted-foreground block font-mono text-[11px]">
                            SKU {i.sku}
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </Field>
                  <Field label="Total">
                    {formatMoney(
                      data.order.totalCents,
                      data.order.currency,
                      "pt-PT",
                    )}
                  </Field>
                  <Field label="Envio">
                    {data.order.shippingCents > 0
                      ? formatMoney(
                          data.order.shippingCents,
                          data.order.currency,
                          "pt-PT",
                        )
                      : "Grátis"}
                  </Field>
                  <Field label="Criado em">
                    {formatDateTime(data.order.createdAt, "pt-PT")}
                  </Field>
                </div>
              </section>

              <Separator />

              {/* Pagamento */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Pagamento</h3>
                {data.payments.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Nenhum pagamento criado ainda.
                  </p>
                ) : (
                  data.payments.map((p) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-2 gap-3 rounded-lg border p-3"
                    >
                      <Field label="Forma">
                        {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                      </Field>
                      <Field label="Gateway">{p.gateway ?? "—"}</Field>
                      <Field label="Status (interno)">
                        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      </Field>
                      <Field label="Status original do gateway">
                        {p.status}
                      </Field>
                      <Field label="ID da transação">
                        {p.externalId ? (
                          <span className="flex items-center gap-1.5 font-mono text-xs">
                            {p.externalId}
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  p.externalId!,
                                  "ID da transação",
                                )
                              }
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Copiar ID da transação"
                            >
                              <Copy className="size-3.5" />
                            </button>
                          </span>
                        ) : (
                          "—"
                        )}
                      </Field>
                      <Field label="Aprovado em">
                        {p.approvedAt
                          ? formatDateTime(p.approvedAt, "pt-PT")
                          : "—"}
                      </Field>
                      {p.cardBrand && p.cardLast4 && (
                        <Field label="Cartão">
                          {p.cardBrand} •••• {p.cardLast4}
                        </Field>
                      )}
                      {p.failureReason && (
                        <Field label="Motivo da recusa">
                          {p.failureReason}
                        </Field>
                      )}
                    </div>
                  ))
                )}
              </section>

              {(data.refunds.length > 0 || data.chargebacks.length > 0) && (
                <>
                  <Separator />
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      Reembolsos e chargebacks
                    </h3>
                    {data.refunds.map((r) => (
                      <p key={r.id} className="text-sm">
                        Reembolso {r.status} —{" "}
                        {formatMoney(
                          r.amountCents,
                          data.order.currency,
                          "pt-PT",
                        )}
                      </p>
                    ))}
                    {data.chargebacks.map((c) => (
                      <p key={c.id} className="text-sm">
                        Chargeback {c.status} —{" "}
                        {formatMoney(
                          c.amountCents,
                          data.order.currency,
                          "pt-PT",
                        )}
                      </p>
                    ))}
                  </section>
                </>
              )}

              <Separator />

              {/* Timeline */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Linha do tempo</h3>
                <ol className="space-y-3 border-l pl-4">
                  {data.timeline.map((e) => (
                    <li key={e.key} className="relative">
                      <span className="bg-primary absolute top-1.5 -left-[21px] size-2 rounded-full" />
                      <p className="text-sm font-medium">{e.label}</p>
                      {e.detail && (
                        <p className="text-muted-foreground text-xs">
                          {e.detail}
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        {formatDateTime(e.at, "pt-PT")}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
