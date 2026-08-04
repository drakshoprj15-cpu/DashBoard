"use client";

import { Link2, Mail, MessageCircle, Search } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { CartRowDTO } from "@/features/carts/client-types";
import {
  isConvertedCategory,
  isEmailableCategory,
} from "@/features/carts/status";
import { whatsAppUrl } from "@/features/carts/phone";
import {
  CART_TEMPLATES,
  buildTemplateVars,
  renderTemplate,
  suggestTemplate,
} from "@/features/carts/templates";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Mensagem de WhatsApp pronta para um carrinho, no modelo sugerido pelo status. */
export function buildWhatsAppMessage(row: CartRowDTO): string {
  const template = CART_TEMPLATES[suggestTemplate(row.category)];
  return renderTemplate(
    template.whatsappBody,
    buildTemplateVars({
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      customerPhone: row.customerPhone,
      productName: row.productName,
      totalCents: row.totalCents,
      currency: row.currency,
      category: row.category,
      checkoutUrl: row.checkoutUrl,
      createdAt: row.createdAt,
    }),
  );
}

export interface CartRecoveryActionsProps {
  row: CartRowDTO;
  onSendEmail: (row: CartRowDTO) => void;
  onOpenWhatsApp: (row: CartRowDTO) => void;
  onOpenDetail?: (orderId: string) => void;
  className?: string;
}

/**
 * Ações de recuperação de um carrinho, reutilizadas na coluna da tabela e no
 * drawer de detalhes. Cada botão é desabilitado com o motivo no tooltip em
 * vez de sumir — o operador precisa saber por que não pode agir.
 */
export function CartRecoveryActions({
  row,
  onSendEmail,
  onOpenWhatsApp,
  onOpenDetail,
  className,
}: CartRecoveryActionsProps) {
  const emailable = isEmailableCategory(row.category);
  const converted = isConvertedCategory(row.category);
  const hasWhatsApp = Boolean(whatsAppUrl(row.customerPhone));

  const emailReason = !row.customerEmail
    ? "Sem e-mail no cadastro"
    : row.marketingOptOut
      ? "Cliente pediu para não receber comunicações"
      : !emailable
        ? "E-mail não disponível para este status"
        : converted
          ? "Enviar confirmação por e-mail"
          : "Enviar lembrete por e-mail";

  const whatsAppReason = !hasWhatsApp
    ? "Telefone ausente ou inválido"
    : row.marketingOptOut
      ? "Cliente pediu para não receber comunicações"
      : "Abrir conversa no WhatsApp";

  async function copyCheckoutUrl() {
    if (!row.checkoutUrl) return;
    try {
      await navigator.clipboard.writeText(row.checkoutUrl);
      toast.success("Link do checkout copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Enviar e-mail"
              disabled={!row.customerEmail || row.marketingOptOut || !emailable}
              onClick={() => onSendEmail(row)}
            >
              <Mail />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{emailReason}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Abrir conversa no WhatsApp"
              className={
                hasWhatsApp && !row.marketingOptOut
                  ? "hover:text-success"
                  : undefined
              }
              disabled={!hasWhatsApp || row.marketingOptOut}
              onClick={() => onOpenWhatsApp(row)}
            >
              <MessageCircle />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{whatsAppReason}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copiar link do checkout"
              disabled={!row.checkoutUrl}
              onClick={copyCheckoutUrl}
            >
              <Link2 />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {row.checkoutUrl
            ? "Copiar link do checkout"
            : "Sem link de checkout registado"}
        </TooltipContent>
      </Tooltip>

      {onOpenDetail && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Ver detalhes"
              onClick={() => onOpenDetail(row.orderId)}
            >
              <Search />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver detalhes</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
