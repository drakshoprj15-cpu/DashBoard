import {
  BadgeCheck,
  Package,
  XCircle,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Boxes,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Eventos reais que o sistema pode disparar — só o que já acontece no
 * código hoje. Nada de eventos genéricos inventados para parecer completo.
 */
export interface WebhookEventDef {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const WEBHOOK_EVENTS: WebhookEventDef[] = [
  {
    key: "order.paid",
    label: "Pedido aprovado",
    description: "Disparado quando o gateway confirma o pagamento.",
    icon: BadgeCheck,
  },
  {
    key: "order.refused",
    label: "Pedido recusado",
    description: "Disparado quando o pagamento é recusado ou expira.",
    icon: XCircle,
  },
  {
    key: "order.refunded",
    label: "Pedido reembolsado",
    description: "Disparado quando um reembolso é confirmado.",
    icon: RotateCcw,
  },
  {
    key: "order.chargeback",
    label: "Chargeback aberto",
    description: "Disparado quando o cliente contesta a cobrança.",
    icon: ShieldAlert,
  },
  {
    key: "checkout.opened",
    label: "Checkout iniciado",
    description: "Disparado quando um visitante abre o checkout.",
    icon: ShoppingBag,
  },
  {
    key: "product.created",
    label: "Produto criado",
    description: "Disparado quando um novo produto é cadastrado.",
    icon: Package,
  },
  {
    key: "product.updated",
    label: "Produto atualizado",
    description: "Disparado quando os dados de um produto mudam.",
    icon: Boxes,
  },
  {
    key: "customer.created",
    label: "Cliente criado",
    description: "Disparado quando um novo cliente é registado.",
    icon: UserPlus,
  },
];

export const WEBHOOK_EVENT_KEYS = WEBHOOK_EVENTS.map((e) => e.key) as [
  string,
  ...string[],
];

export const WEBHOOK_EVENT_LABEL: Record<string, string> = Object.fromEntries(
  WEBHOOK_EVENTS.map((e) => [e.key, e.label]),
);

export function eventLabel(key: string): string {
  return WEBHOOK_EVENT_LABEL[key] ?? key;
}
