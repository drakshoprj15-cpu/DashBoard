"use client";

import * as React from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { CartRowDTO } from "@/features/carts/client-types";
import {
  CART_TEMPLATES,
  CART_TEMPLATE_LIST,
  TEMPLATE_VARIABLES,
  buildTemplateVars,
  findMissingVariables,
  renderTemplate,
  suggestTemplate,
  type CartTemplateKey,
} from "@/features/carts/templates";
import { whatsAppUrl } from "@/features/carts/phone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type ReminderChannel = "email" | "whatsapp";

export interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Carrinhos alvo — 1 no disparo individual, N no disparo em massa. */
  targets: CartRowDTO[];
  /** Total encontrado quando o alvo veio de um filtro maior que o lote enviado. */
  matchedTotal?: number;
  sending: boolean;
  onConfirm: (channel: ReminderChannel, template: CartTemplateKey) => void;
}

/**
 * Revisão antes de qualquer disparo: canal, modelo e pré-visualização da
 * mensagem com as variáveis já substituídas pelo primeiro destinatário.
 * Nada sai daqui sem o operador ver o texto exato que o cliente vai receber.
 */
export function ReminderDialog({
  open,
  onOpenChange,
  targets,
  matchedTotal,
  sending,
  onConfirm,
}: ReminderDialogProps) {
  const first = targets[0];
  const [channel, setChannel] = React.useState<ReminderChannel>("email");
  const [template, setTemplate] = React.useState<CartTemplateKey>("abandoned");

  // Sempre que o alvo muda, sugere o modelo adequado à categoria dele —
  // ajuste síncrono na renderização, o padrão já usado em `cart-filters`.
  const targetKey = first?.orderId ?? "";
  const [prevTargetKey, setPrevTargetKey] = React.useState(targetKey);
  if (targetKey !== prevTargetKey) {
    setPrevTargetKey(targetKey);
    if (first) setTemplate(suggestTemplate(first.category));
  }

  const vars = first
    ? buildTemplateVars({
        customerName: first.customerName,
        customerEmail: first.customerEmail,
        customerPhone: first.customerPhone,
        productName: first.productName,
        totalCents: first.totalCents,
        currency: first.currency,
        category: first.category,
        checkoutUrl: first.checkoutUrl,
        createdAt: first.createdAt,
      })
    : {};

  const selected = CART_TEMPLATES[template];
  const body = channel === "email" ? selected.emailBody : selected.whatsappBody;
  const preview = renderTemplate(body, vars);
  const subject = renderTemplate(selected.subject, vars);
  const preheader = renderTemplate(selected.preview, vars);
  const missing = findMissingVariables(body, vars);

  const optedOut = targets.filter((t) => t.marketingOptOut).length;
  const withoutEmail = targets.filter((t) => !t.customerEmail).length;
  const withoutPhone = targets.filter(
    (t) => !whatsAppUrl(t.customerPhone),
  ).length;
  const blocked =
    channel === "email" ? optedOut + withoutEmail : optedOut + withoutPhone;
  const deliverable = Math.max(0, targets.length - blocked);

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(
        channel === "email" ? `${subject}\n\n${preview}` : preview,
      );
      toast.success("Mensagem copiada.");
    } catch {
      toast.error("Não foi possível copiar a mensagem.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Mail className="size-4" aria-hidden="true" />
            Disparar mensagem
          </SheetTitle>
          <SheetDescription>
            Revise antes de enviar — nada é disparado automaticamente.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 px-4 pb-6">
          <div>
            <Label className="text-muted-foreground text-xs font-normal">
              Canal
            </Label>
            <div className="mt-1.5 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={channel === "email" ? "default" : "outline"}
                onClick={() => setChannel("email")}
              >
                <Mail /> E-mail
              </Button>
              <Button
                type="button"
                size="sm"
                variant={channel === "whatsapp" ? "default" : "outline"}
                onClick={() => setChannel("whatsapp")}
              >
                <MessageCircle /> WhatsApp
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs font-normal">
              Modelo
            </Label>
            <div className="mt-1.5 grid gap-2">
              {CART_TEMPLATE_LIST.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTemplate(t.key)}
                  aria-pressed={template === t.key}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    template === t.key
                      ? "border-primary bg-accent/60"
                      : "hover:bg-accent/40",
                  )}
                >
                  <span className="font-medium">{t.label}</span>
                  <span className="text-muted-foreground block text-xs">
                    {t.subject}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-muted-foreground text-xs font-normal">
              Pré-visualização{" "}
              {first ? `— ${first.customerName ?? first.reference}` : ""}
            </Label>
            <div className="bg-muted/40 mt-1.5 space-y-2 rounded-lg border p-3 text-sm">
              {channel === "email" && (
                <>
                  <p className="font-medium">
                    <span className="text-muted-foreground text-xs">
                      Assunto:{" "}
                    </span>
                    {subject}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    <span>Prévia na caixa de entrada: </span>
                    {preheader}
                  </p>
                </>
              )}
              <p className="leading-relaxed whitespace-pre-wrap">{preview}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={copyPreview}
              >
                <Copy /> Copiar mensagem
              </Button>
              {missing.length > 0 && (
                <Badge variant="warning">
                  Sem valor: {missing.map((v) => `{{${v}}}`).join(", ")}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              Variáveis disponíveis:{" "}
              {TEMPLATE_VARIABLES.map((v) => `{{${v}}}`).join(" · ")}
            </p>
          </div>

          <div className="bg-muted/50 space-y-1.5 rounded-lg border p-3 text-sm">
            <p>
              <span className="font-semibold">{deliverable}</span> de{" "}
              {targets.length} destinatário
              {targets.length === 1 ? "" : "s"} devem receber.
            </p>
            {typeof matchedTotal === "number" &&
              matchedTotal > targets.length && (
                <p className="text-muted-foreground text-xs">
                  {matchedTotal} carrinhos correspondem ao filtro; o envio foi
                  limitado a {targets.length} por disparo.
                </p>
              )}
            {blocked > 0 && (
              <p className="text-muted-foreground text-xs">
                {blocked} fora do envio:{" "}
                {channel === "email"
                  ? `${optedOut} sem consentimento, ${withoutEmail} sem e-mail`
                  : `${optedOut} sem consentimento, ${withoutPhone} sem telefone válido`}
                .
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              Clientes bloqueados, suprimidos ou lembrados nas últimas 20 horas
              são excluídos automaticamente.
            </p>
            {channel === "whatsapp" && (
              <p className="text-muted-foreground text-xs">
                O WhatsApp abre no seu aplicativo com a mensagem pronta — o
                envio é feito por si, uma conversa de cada vez.
              </p>
            )}
          </div>
        </div>

        <SheetFooter>
          <Button
            type="button"
            loading={sending}
            disabled={targets.length === 0}
            onClick={() => onConfirm(channel, template)}
          >
            {channel === "email" ? <Mail /> : <MessageCircle />} Enviar agora
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
